import { describe, expect, it, vi } from 'vitest'
import {
  askMergeAgent,
  buildMergeMessages,
  describeStages,
  generateMergePromptTags,
  hasConflictMarkers,
  MAX_MERGE_CHARS,
  mergeSizeError,
  parseMergeResponse,
  restoreEol
} from '../src/main/ai/merge-agent'

describe('parseMergeResponse', () => {
  it('parses a resolve decision with its merged content', () => {
    const decision = parseMergeResponse(
      '{"action":"resolve","summary":"kept both","content":"line\\n"}'
    )
    expect(decision).toEqual({
      kind: 'resolve',
      content: 'line\n',
      summary: 'kept both'
    })
  })

  it('tolerates ```json fences', () => {
    const decision = parseMergeResponse(
      '```json\n{"action":"resolve","content":"x"}\n```'
    )
    expect(decision).toEqual({ kind: 'resolve', content: 'x', summary: '' })
  })

  it('parses an ask decision with questions', () => {
    const decision = parseMergeResponse(
      '{"action":"ask","questions":[{"id":"q1","prompt":"Which wins?","options":["A","B"]}]}'
    )
    expect(decision.kind).toBe('ask')
    expect(decision.kind === 'ask' && decision.questions).toEqual([
      { id: 'q1', prompt: 'Which wins?', options: ['A', 'B'] }
    ])
  })

  it('drops non-string options and blank option lists', () => {
    const decision = parseMergeResponse(
      '{"action":"ask","questions":[{"id":"q1","prompt":"P?","options":[1,null]}]}'
    )
    expect(decision.kind === 'ask' && decision.questions[0].options).toBeUndefined()
  })

  it('rejects invalid JSON with a friendly message', () => {
    expect(() => parseMergeResponse('not json')).toThrow(/invalid JSON/)
  })

  it('rejects an action that is neither ask nor resolve', () => {
    expect(() => parseMergeResponse('{"action":"shrug"}')).toThrow(
      /did not say whether/
    )
  })

  it('rejects a resolve without usable content', () => {
    expect(() => parseMergeResponse('{"action":"resolve","content":""}')).toThrow(
      /empty merged file/
    )
  })

  it('rejects an ask without questions', () => {
    expect(() => parseMergeResponse('{"action":"ask","questions":[]}')).toThrow(
      /invalid questions/
    )
  })

  it('rejects a question with no prompt text', () => {
    expect(() =>
      parseMergeResponse('{"action":"ask","questions":[{"id":"q1"}]}')
    ).toThrow(/invalid questions/)
  })
})

describe('describeStages', () => {
  it('names the ordinary 3-way conflict', () => {
    expect(describeStages(new Set([1, 2, 3]))).toMatch(/3-way/)
  })

  it('names a modify/delete conflict', () => {
    expect(describeStages(new Set([2]))).toMatch(
      /modified by us and deleted by the other side/
    )
    expect(describeStages(new Set([3]))).toMatch(
      /deleted by us while the other side modified it/
    )
  })

  it('names an add/add conflict', () => {
    expect(describeStages(new Set([2, 3]))).toMatch(/add\/add/)
  })
})

describe('buildMergeMessages', () => {
  it('wraps the working content in per-request random tags', () => {
    const tags = generateMergePromptTags()
    const other = generateMergePromptTags()
    expect(tags.fileOpen).toMatch(/^<file-[a-z0-9]+>$/)
    expect(tags.fileOpen).not.toBe(other.fileOpen)

    const messages = buildMergeMessages({
      path: 'src/a.ts',
      content: '<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b',
      stageDescription: 'both sides modified it',
      stageBlocks: '',
      exchanges: [],
      tags
    })
    expect(messages[0].role).toBe('system')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain(
      `${tags.fileOpen}\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b\n${tags.fileClose}`
    )
    expect(messages[1].content).toContain('"src/a.ts"')
  })

  it('notes an absent working file instead of an empty block', () => {
    const messages = buildMergeMessages({
      path: 'gone.txt',
      content: '',
      stageDescription: 'we modified it and the other side deleted it',
      stageBlocks: '',
      exchanges: [],
      tags: generateMergePromptTags()
    })
    expect(messages[1].content).toContain('no working-tree file')
  })

  it('replays each exchange as an assistant/user pair carrying the answers', () => {
    const messages = buildMergeMessages({
      path: 'a.txt',
      content: 'x',
      stageDescription: 'both sides modified it',
      stageBlocks: '',
      exchanges: [
        {
          questions: [{ id: 'q1', prompt: 'Keep the retry?', options: ['Yes', 'No'] }],
          answers: [{ questionId: 'q1', answer: 'Yes, keep it' }]
        }
      ],
      tags: generateMergePromptTags()
    })
    expect(messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(JSON.parse(messages[2].content).action).toBe('ask')
    expect(messages[3].content).toContain('Keep the retry?')
    expect(messages[3].content).toContain('Answer: Yes, keep it')
    // The first ask round is not yet forced — the agent may still ask back.
    expect(messages[3].content).not.toContain('answer with action "resolve" now')
  })

  it('forces a resolution once two answer rounds are on the table', () => {
    const round = {
      questions: [{ id: 'q1', prompt: 'P?' }],
      answers: [{ questionId: 'q1', answer: 'A' }]
    }
    const messages = buildMergeMessages({
      path: 'a.txt',
      content: 'x',
      stageDescription: 'both sides modified it',
      stageBlocks: '',
      exchanges: [round, round],
      tags: generateMergePromptTags()
    })
    expect(messages[messages.length - 1].content).toContain(
      'answer with action "resolve" now'
    )
  })
})

describe('write-back safety', () => {
  it('recognizes a full conflict marker set', () => {
    expect(
      hasConflictMarkers('a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> main\nd\n')
    ).toBe(true)
  })

  it('accepts content whose separators are ordinary prose', () => {
    expect(hasConflictMarkers('a\n=== not a marker ===\nb\n')).toBe(false)
    // Only one or two of the three never marks a real conflict.
    expect(hasConflictMarkers('<<<<<<< alone\n=======\n')).toBe(false)
  })

  it('restores CRLF endings when the file on disk used them', () => {
    expect(restoreEol('a\nb\n', 'a\r\nx\r\nb\r\n')).toBe('a\r\nb\r\n')
  })

  it('leaves LF content alone for LF files', () => {
    expect(restoreEol('a\nb\n', 'a\nb\n')).toBe('a\nb\n')
  })

  it('lets content that already mixes endings through untouched', () => {
    expect(restoreEol('a\r\nb\n', 'a\r\nb\r\n')).toBe('a\r\nb\n')
  })

  it('refuses oversized files before contacting the endpoint', () => {
    expect(mergeSizeError('x'.repeat(100))).toBeNull()
    expect(mergeSizeError('x'.repeat(MAX_MERGE_CHARS + 1))).toMatch(/larger than/)
  })
})

describe('askMergeAgent request', () => {
  const messages = [{ role: 'user' as const, content: 'merge this' }]

  it('posts the conversation to /chat/completions with auth', async () => {
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      const request = init as { headers: Record<string, string>; body: string }
      expect(request.headers.Authorization).toBe('Bearer sk-test')
      const body = JSON.parse(request.body)
      expect(body.temperature).toBe(0.1)
      expect(body.messages).toEqual(messages)
      return jsonResponse({
        choices: [
          {
            message: {
              content: '{"action":"resolve","summary":"ok","content":"merged\\n"}'
            }
          }
        ]
      })
    })

    const decision = await askMergeAgent({
      messages,
      baseUrl: 'https://api.example.test/v1',
      model: 'test-model',
      apiKey: 'sk-test',
      fetchFn: fetchFn as unknown as typeof fetch
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/chat/completions',
      expect.anything()
    )
    expect(decision).toEqual({ kind: 'resolve', content: 'merged\n', summary: 'ok' })
  })

  it('surfaces HTTP errors with status and body', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 401, 'Unauthorized'))
    await expect(
      askMergeAgent({
        messages,
        baseUrl: 'https://api.example.test/v1',
        model: 'm',
        apiKey: 'bad',
        fetchFn: fetchFn as unknown as typeof fetch
      })
    ).rejects.toThrow(/401 Unauthorized/)
  })
})

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}
