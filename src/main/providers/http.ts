import { API_TIMEOUT_MS } from './config'

/**
 * A thin wrapper over the global fetch (Node 20 in Electron main, same tool
 * the AI commit agent uses): one timeout budget per call, tolerant JSON
 * parsing, and provider error bodies rendered into one actionable line.
 */
export interface ApiResponse {
  readonly status: number
  readonly ok: boolean
  readonly headers: Headers
  /** Parsed JSON body; `{}` when the body is missing or not JSON. */
  readonly json: Record<string, unknown>
  readonly text: string
}

export class ProviderHttpError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
}

export async function apiFetch(
  url: string,
  init?: RequestInit
): Promise<ApiResponse> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS)
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`The request to ${new URL(url).host} failed: ${reason}`)
  }
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed !== null && typeof parsed === 'object') {
      json = parsed as Record<string, unknown>
    }
  } catch {
    /* non-JSON body: callers work from status + text */
  }
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    json,
    text
  }
}

/**
 * One-line reason for a failed hosted-API call, pulling the provider's own
 * message out of the body where present and mapping the common statuses to
 * guidance the UI can act on.
 */
export function providerErrorMessage(
  providerName: string,
  res: ApiResponse
): string {
  const body = res.json as { message?: unknown; error?: unknown; errors?: unknown }
  const detail =
    typeof body.message === 'string'
      ? body.message
      : typeof body.error === 'string'
        ? body.error
        : res.text.slice(0, 200)
  switch (res.status) {
    case 401:
      return `${providerName} rejected the token (401). Sign in again, or use a token with read access to your repositories.`
    case 403:
      return `${providerName} refused the request (403) — the token may lack a required scope or you may be rate-limited. ${detail}`
    case 404:
      return `Not found at ${providerName}: ${detail}`
    case 422:
      return `${providerName} rejected the query (422): ${detail}`
    case 429:
      return `${providerName} is rate-limiting this token. Try again in a few minutes.`
    default:
      return `${providerName} returned HTTP ${res.status}: ${detail}`
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function bool(value: unknown): boolean {
  return value === true
}
