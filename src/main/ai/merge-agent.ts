import type { MergeExchange, MergeQuestion } from '../../shared/models'

/**
 * The merge-conflict counterpart of the commit-message agent: the conflicted
 * working-tree file goes to an OpenAI-compatible endpoint and either a full
 * merged file comes back, or — when the model genuinely cannot tell which
 * intent to keep — the questions it needs answered first.
 *
 * Same trust posture as `commit-agent.ts`: untrusted file content is wrapped
 * in per-request randomized tags, and the reply is parsed tolerantly
 * (optional ``` fences) then validated strictly.
 */

export const MERGE_SYSTEM_PROMPT = `
You are a careful git merge assistant. You receive one conflicted file from a
repository: either its working-tree content containing git conflict markers
(<<<<<<< / ======= / >>>>>>>, and for a 3-way conflict a base separator), or
a plain file when the conflict is about a delete/add rather than diverging
lines.

Merge the file so that both sides' intent is preserved wherever the changes
are compatible — combine them semantically, do not merely pick one side.
Keep formatting, indentation, comments and the trailing-newline behaviour of
the surrounding code; your merged content must contain no conflict markers.

When a choice is genuinely a product decision you cannot derive from the code
(e.g. two features that truly cannot coexist, or semantics that depend on
context you do not have), do NOT guess: ask instead. Ask at most 3 focused
questions, each with a short id, the question text, and optionally 2-4
concrete answer options. Only ask what blocks you — answer anything the code
itself makes obvious.

Answer with a single JSON object and nothing else:

{
  "action": "resolve",
  "summary": "One sentence describing how you merged and why.",
  "content": "<the ENTIRE merged file content, JSON-encoded>"
}

or

{
  "action": "ask",
  "questions": [
    { "id": "q1", "prompt": "Which behaviour should win?", "options": ["Keep A", "Keep B"] }
  ]
}

After the user answers your questions, prefer resolving with those answers
over asking again; ask only if an answer raises a new blocking ambiguity.
`

/** Past this size the agent refuses rather than feed a huge file to the API. */
export const MAX_MERGE_CHARS = 150_000

export interface MergePromptTags {
  readonly fileOpen: string
  readonly fileClose: string
}

/** Fresh tags per request so file content cannot forge the trust boundary. */
export function generateMergePromptTags(): MergePromptTags {
  const token = Math.random().toString(36).slice(2, 10)
  return { fileOpen: `<file-${token}>`, fileClose: `</file-${token}>` }
}

/** The size guard for the merge request; returns null when within budget. */
export function mergeSizeError(content: string): string | null {
  if (content.length <= MAX_MERGE_CHARS) return null
  return `This conflicted file is larger than ${Math.floor(MAX_MERGE_CHARS / 1000)} KB — the AI merge agent skips huge files; resolve it by hand.`
}

/**
 * A one-line passive description of the conflict kind derived from the index
 * stages (`git ls-files -u`) — phrased to slot into "The file was …" so the
 * model learns whether it is looking at a both-modified conflict or a
 * modify/delete situation the working file cannot show in markers.
 */
export function describeStages(stages: ReadonlySet<number>): string {
  const has = (n: number): boolean => stages.has(n)
  if (has(1) && has(2) && has(3)) {
    return 'modified by both sides (a 3-way conflict: base, ours and theirs are all present inside the markers)'
  }
  if (has(2) && !has(3)) {
    return 'modified by us and deleted by the other side (no incoming content exists — the working file is our version, without markers)'
  }
  if (has(3) && !has(2)) {
    return 'deleted by us while the other side modified it (no working-tree file exists; the incoming version is provided below)'
  }
  if (!has(1) && has(2) && has(3)) {
    return 'added by both sides independently with different content (an add/add conflict with no common base)'
  }
  return 'left in an unusual conflict state — inspect the provided content carefully'
}

export interface BuildMessagesInput {
  readonly path: string
  readonly content: string
  /** Output of {@link describeStages}. */
  readonly stageDescription: string
  /**
   * Extra tag-wrapped stage blocks (`git show :2:path` / `:3:path`) for the
   * conflict shapes the working file alone cannot show — modify/delete and
   * add/add. Empty string when none apply.
   */
  readonly stageBlocks: string
  readonly exchanges: ReadonlyArray<MergeExchange>
  readonly tags: MergePromptTags
}

/**
 * The full chat transcript: system prompt, the conflicted file as the first
 * user message, then one assistant/user pair per completed question round.
 * Past the second round the model is told it must resolve now.
 */
export function buildMergeMessages(
  input: BuildMessagesInput
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }> = [{ role: 'system', content: MERGE_SYSTEM_PROMPT }]

  const working =
    input.content.length > 0
      ? `${input.tags.fileOpen}\n${input.content}\n${input.tags.fileClose}`
      : '(no working-tree file — it was deleted on one side)'

  messages.push({
    role: 'user',
    content: `Resolve the merge conflict in "${input.path}". The file was ${input.stageDescription}.

Working-tree content:
${working}
${input.stageBlocks}`
  })

  for (const exchange of input.exchanges) {
    messages.push({
      role: 'assistant',
      content: JSON.stringify({ action: 'ask', questions: exchange.questions })
    })
    const answers = formatAnswers(exchange)
    const forcing =
      input.exchanges.length >= 2
        ? '\n\nYou have had your chance to ask: answer with action "resolve" now, deciding with these answers.'
        : ''
    messages.push({ role: 'user', content: `${answers}${forcing}` })
  }

  return messages
}

function formatAnswers(exchange: MergeExchange): string {
  const byId = new Map(
    exchange.answers.map(a => [a.questionId, a.answer] as const)
  )
  const lines = exchange.questions.map(q => {
    const answer = byId.get(q.id) ?? '(no answer given)'
    return `  ${q.prompt}\n  Answer: ${answer}`
  })
  return `Answers to your questions:\n${lines.join('\n')}`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseQuestions(value: unknown): MergeQuestion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) {
    throw new Error(
      'The AI merge agent returned invalid questions. Try again or resolve by hand.'
    )
  }
  const questions: MergeQuestion[] = []
  for (const raw of value) {
    if (!isRecord(raw)) throw invalidQuestions()
    const id = raw.id
    const prompt = raw.prompt
    if (typeof id !== 'string' || id.trim().length === 0) throw invalidQuestions()
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw invalidQuestions()
    }
    let options: string[] | undefined
    if (Array.isArray(raw.options)) {
      const strs = raw.options.filter(o => typeof o === 'string') as string[]
      if (strs.length > 0) options = strs.slice(0, 6)
    }
    questions.push({ id: id.trim(), prompt: prompt.trim(), options })
  }
  return questions
}

function invalidQuestions(): Error {
  return new Error(
    'The AI merge agent returned invalid questions. Try again or resolve by hand.'
  )
}

/**
 * The agent's decision for one turn. `resolve` carries the full merged
 * content for the caller to validate and write; the IPC outcome
 * ({@link AiMergeOutcome}) drops the content because applying it happens in
 * main before the renderer ever sees a result.
 */
export type MergeDecision =
  | { kind: 'ask'; questions: MergeQuestion[] }
  | { kind: 'resolve'; content: string; summary: string }

/** Tolerant (strip fences) then strict (validate the contract) — commit-agent style. */
export function parseMergeResponse(content: string): MergeDecision {
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)```/) ||
    content.match(/```\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      'The AI merge agent returned invalid JSON. Try again or resolve by hand.'
    )
  }
  if (!isRecord(parsed)) {
    throw new Error('The AI merge agent returned a non-object payload.')
  }

  if (parsed.action === 'ask') {
    return { kind: 'ask', questions: parseQuestions(parsed.questions) }
  }
  if (parsed.action !== 'resolve') {
    throw new Error(
      'The AI merge agent did not say whether it resolved or needs to ask.'
    )
  }

  const merged = parsed.content
  if (typeof merged !== 'string' || merged.length === 0) {
    throw new Error(
      'The AI merge agent returned an empty merged file. Nothing was changed.'
    )
  }
  const summary =
    typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  return { kind: 'resolve', content: merged, summary }
}

/** True when the text still carries a full <<<<<<< / ======= / >>>>>>> set. */
export function hasConflictMarkers(text: string): boolean {
  return (
    /^<<<<<<<[^\r\n]*\r?\n/m.test(text) &&
    /^=======\r?\n/m.test(text) &&
    /^>>>>>>>[^\r\n]*\r?\n/m.test(text)
  )
}

/**
 * A model reply is plain text with LF endings; if the file on disk used CRLF,
 * restore them so the merge does not silently rewrite every line ending.
 */
export function restoreEol(merged: string, original: string): string {
  const originalCrlf = original.includes('\r\n')
  const mergedCrlf = merged.includes('\r\n')
  if (originalCrlf && !mergedCrlf) {
    return merged.replace(/\n/g, '\r\n')
  }
  return merged
}

export interface AskMergeOptions {
  readonly messages: ReadonlyArray<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  readonly baseUrl: string
  readonly model: string
  readonly apiKey: string
  readonly signal?: AbortSignal
  /** Injectable for tests. */
  readonly fetchFn?: typeof fetch
}

/**
 * Runs one chat-completions turn of the merge conversation and applies the
 * contract. On a resolve decision the caller must still validate and write
 * {@link MergeDecision.content}; nothing here touches the file.
 */
export async function askMergeAgent(
  options: AskMergeOptions
): Promise<MergeDecision> {
  const doFetch = options.fetchFn ?? fetch
  const response = await doFetch(
    `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.1,
        messages: options.messages
      }),
      signal: options.signal
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `AI request failed (${response.status} ${response.statusText})${text.length > 0 ? `: ${trimForError(text)}` : '. Check the base URL, key and model in Preferences.'}`
    )
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('The AI model returned an empty response.')
  }

  return parseMergeResponse(content)
}

function trimForError(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 300 ? oneLine.slice(0, 300) + '…' : oneLine
}
