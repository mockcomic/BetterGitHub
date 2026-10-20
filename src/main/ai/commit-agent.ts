import type { GeneratedCommitMessage } from '../../shared/models'

/**
 * Provider-neutral port of the commit-message generation flow observed in
 * GitHub Desktop 3.6.7 (`app/src/lib/stores/copilot-store.ts` and
 * `app/src/lib/copilot-commit-message.ts`, verified from the shipped
 * artifact):
 *
 *  - a fixed system prompt describing the JSON contract,
 *  - the untrusted diff wrapped in randomized `<diff-TOKEN>` tags so diff
 *    content cannot break the trust boundary,
 *  - user-editable rules injected as *fixed* constraints,
 *  - response parsed leniently (optional ``` fences) then validated strictly.
 */

export const COMMIT_MESSAGE_SYSTEM_PROMPT = `
You're an AI assistant whose job is to concisely summarize code changes into
short, useful commit messages, with a title and a description.

A changeset is given in the git diff output format, affecting one or multiple files.

The commit title should be no longer than 50 characters and should summarize the
contents of the changeset for other developers reading the commit history.

The commit description can be longer, and should provide more context about the
changeset, including why the changeset is being made, and any other relevant
information. The commit description is optional, so you can omit it if the
changeset is small enough that it can be described in the commit title or if you
don't have enough context.

By default, do not add a Co-authored-by: trailer or otherwise attribute
the commit to an AI. Commit authorship belongs to the developer unless other
instructions say otherwise.

Be brief and concise.

Do NOT include a description of changes in "lock" files from dependency managers
like npm, yarn, or pip (and others), unless those are the only changes in the
commit.

Your response must be a JSON object with the attributes "title" and "description"
containing the commit title and commit description. Do not use markdown to wrap
the JSON object, just return it as plain text. For example:

{
  "title": "Fix issue with login form",
  "description": "The login form was not submitting correctly. This commit fixes that issue by adding a missing \`name\` attribute to the submit button."
}
`

export interface CommitMessagePromptTags {
  readonly diffOpen: string
  readonly diffClose: string
}

/** Fresh tags per request so the diff cannot forge the trust boundary. */
export function generateCommitMessagePromptTags(): CommitMessagePromptTags {
  const token = Math.random().toString(36).slice(2, 10)
  return { diffOpen: `<diff-${token}>`, diffClose: `</diff-${token}>` }
}

/** Cap the diff so huge changesets don't explode the request budget. */
export const MAX_DIFF_CHARS = 100_000

export function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff
  return (
    diff.slice(0, MAX_DIFF_CHARS) +
    '\n\n... (diff truncated for brevity — summarize based on the visible portion)'
  )
}

export function buildCommitMessageSystemPrompt(
  customInstructions: string
): string {
  const rules = customInstructions.trim()
  if (rules.length === 0) return COMMIT_MESSAGE_SYSTEM_PROMPT
  return `${COMMIT_MESSAGE_SYSTEM_PROMPT}
Additional fixed rules provided by the repository owner (these take
precedence over the defaults where they conflict):
${rules.split('\n').map(l => `  ${l}`).join('\n')}
`
}

export function buildCommitMessageUserPrompt(
  diff: string,
  tags: CommitMessagePromptTags
): string {
  const diffBlock = `${tags.diffOpen}\n${diff}\n${tags.diffClose}`
  return `Generate a commit message for the following changeset.

${diffBlock}`
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Tolerant-then-strict parsing of the model response (ported from
 * `parseCopilotCommitMessage`).
 */
export function parseCommitMessageResponse(
  content: string
): GeneratedCommitMessage {
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)```/) ||
    content.match(/```\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      'The AI model returned invalid JSON for the commit message. Try again.'
    )
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'The AI model returned an invalid commit message payload: expected an object.'
    )
  }

  const title = parsed.title
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error(
      'The AI model returned an invalid commit message payload: "title" must be a non-empty string.'
    )
  }

  const description = parsed.description
  if (description === undefined || description === null) {
    return { title: title.trim(), description: '' }
  }

  if (typeof description !== 'string') {
    throw new Error(
      'The AI model returned an invalid commit message payload: "description" must be a string when provided.'
    )
  }

  return { title: title.trim(), description: description.trim() }
}

export interface GenerateOptions {
  readonly diff: string
  readonly baseUrl: string
  readonly model: string
  readonly apiKey: string
  readonly customInstructions: string
  readonly signal?: AbortSignal
  /** Injectable for tests. */
  readonly fetchFn?: typeof fetch
}

/**
 * Calls an OpenAI-compatible chat-completions endpoint
 * (`POST {baseUrl}/chat/completions`) and returns the parsed message.
 */
export async function generateCommitMessage(
  options: GenerateOptions
): Promise<GeneratedCommitMessage> {
  const tags = generateCommitMessagePromptTags()
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
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: buildCommitMessageSystemPrompt(options.customInstructions)
          },
          {
            role: 'user',
            content: buildCommitMessageUserPrompt(
              truncateDiff(options.diff),
              tags
            )
          }
        ]
      }),
      signal: options.signal
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `AI request failed (${response.status} ${response.statusText})${text.length > 0 ? `: ${trimForError(text)}` : '. Check the base URL, key and model in Settings.'}`
    )
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('The AI model returned an empty response.')
  }

  return parseCommitMessageResponse(content)
}

/** Light-weight connection probe: GET {baseUrl}/models. */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
  fetchFn?: typeof fetch
): Promise<{ ok: boolean; message: string }> {
  const doFetch = fetchFn ?? fetch
  try {
    const base = baseUrl.replace(/\/+$/, '')
    let res = await doFetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) {
      // Fall back to a minimal completion (some providers don't expose /models).
      res = await doFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        })
      })
    }
    if (res.ok) {
      return { ok: true, message: 'Connected successfully.' }
    }
    const body = trimForError(await res.text().catch(() => ''))
    return {
      ok: false,
      message: `Request failed (${res.status} ${res.statusText})${body.length > 0 ? `: ${body}` : ''}`
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

function trimForError(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > 300 ? oneLine.slice(0, 300) + '…' : oneLine
}
