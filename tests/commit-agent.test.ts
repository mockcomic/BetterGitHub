import { describe, expect, it, vi } from 'vitest'
import {
  buildCommitMessageSystemPrompt,
  buildCommitMessageUserPrompt,
  generateCommitMessage,
  generateCommitMessagePromptTags,
  parseCommitMessageResponse,
  truncateDiff,
  MAX_DIFF_CHARS
} from '../src/main/ai/commit-agent'

describe('parseCommitMessageResponse', () => {
  it('parses plain JSON', () => {
    expect(
      parseCommitMessageResponse('{"title": "Add feature", "description": "Details"}')
    ).toEqual({ title: 'Add feature', description: 'Details' })
  })

  it('tolerates ```json fences', () => {
    expect(
      parseCommitMessageResponse('```json\n{"title": "Fix bug"}\n```')
    ).toEqual({ title: 'Fix bug', description: '' })
  })

  it('tolerates generic code fences', () => {
    expect(parseCommitMessageResponse('```\n{"title": "Tidy"}\n```')).toEqual({
      title: 'Tidy',
      description: ''
    })
  })

  it('rejects a non-object payload', () => {
    expect(() => parseCommitMessageResponse('"just a string"')).toThrow(
      /expected an object/
    )
  })

  it('rejects an empty title', () => {
    expect(() => parseCommitMessageResponse('{"title": "  "}')).toThrow(
      /non-empty string/
    )
  })

  it('rejects invalid JSON with a friendly message', () => {
    expect(() => parseCommitMessageResponse('not json at all')).toThrow(
      /invalid JSON/
    )
  })
})

describe('prompt construction', () => {
  it('wraps the diff in per-request random tags', () => {
    const a = generateCommitMessagePromptTags()
    const b = generateCommitMessagePromptTags()
    expect(a.diffOpen).toMatch(/^<diff-[a-z0-9]+>$/)
    expect(a.diffClose).toBe(`</${a.diffOpen.slice(1, -1)}>`)
    expect(a.diffOpen).not.toBe(b.diffOpen)
  })

  it('embeds the diff between the tags in the user prompt', () => {
    const tags = generateCommitMessagePromptTags()
    const prompt = buildCommitMessageUserPrompt('diff --git a/x b/x', tags)
    expect(prompt).toContain(`${tags.diffOpen}\ndiff --git a/x b/x\n${tags.diffClose}`)
  })

  it('adds fixed rules to the system prompt only when provided', () => {
    expect(buildCommitMessageSystemPrompt('')).not.toMatch(/repository owner/)
    expect(buildCommitMessageSystemPrompt('  ')).not.toMatch(/repository owner/)
    const withRules = buildCommitMessageSystemPrompt('use conventional commits')
    expect(withRules).toMatch(/use conventional commits/)
  })

  it('truncates huge diffs', () => {
    const big = 'x'.repeat(MAX_DIFF_CHARS + 1000)
    const truncated = truncateDiff(big)
    expect(truncated.length).toBeLessThan(big.length)
    expect(truncated).toContain('truncated')
  })
})

describe('generateCommitMessage request', () => {
  it('posts to /chat/completions with auth and parses the JSON reply', async () => {
    const fetchFn = vi.fn(async (_url: unknown, init: unknown) => {
      const request = init as { headers: Record<string, string>; body: string }
      expect(request.headers.Authorization).toBe('Bearer sk-test')
      const body = JSON.parse(request.body)
      expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
        'system',
        'user'
      ])
      return jsonResponse({
        choices: [{ message: { content: '{"title":"Hello","description":"World"}' } }]
      })
    })

    const result = await generateCommitMessage({
      diff: 'diff --git a/a b/a',
      baseUrl: 'https://api.example.test/v1',
      model: 'test-model',
      apiKey: 'sk-test',
      customInstructions: '',
      fetchFn: fetchFn as unknown as typeof fetch
    })

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/v1/chat/completions',
      expect.anything()
    )
    expect(result).toEqual({ title: 'Hello', description: 'World' })
  })

  it('surfaces HTTP errors with status and body', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 401, 'Unauthorized'))
    await expect(
      generateCommitMessage({
        diff: 'd',
        baseUrl: 'https://api.example.test/v1',
        model: 'm',
        apiKey: 'bad',
        customInstructions: '',
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
