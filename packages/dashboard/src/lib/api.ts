/**
 * API client for communicating with the aouo agent server.
 *
 * Token is captured eagerly at module load — BEFORE React Router's first
 * Navigate strips the `?token=...` query — and mirrored to sessionStorage
 * so subsequent in-app navigations and refreshes can still authenticate.
 * All requests attach it via the X-Aouo-Token header.
 */

const TOKEN_STORAGE_KEY = 'aouo-token'

function captureToken(): string {
  if (typeof window === 'undefined') return ''
  const fromUrl = new URL(window.location.href).searchParams.get('token')
  if (fromUrl) {
    try {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, fromUrl)
    } catch {
      // sessionStorage may be unavailable (privacy mode). Module-level fallback still works.
    }
    return fromUrl
  }
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

const _token = captureToken()

function getToken(): string {
  return _token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Aouo-Token': getToken(),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }

  return res.json()
}

export interface SseFrame {
  event: string
  data: unknown
}

export interface StreamOptions {
  signal?: AbortSignal
}

/**
 * POSTs `body` to `path` and yields parsed SSE frames to `onFrame` until the
 * server closes the stream. Throws on non-2xx HTTP responses; later transport
 * errors are surfaced through the caller's `onFrame` (the agent emits an
 * `event: error` frame before closing).
 */
async function stream(
  path: string,
  body: unknown,
  onFrame: (frame: SseFrame) => void,
  opts: StreamOptions = {},
): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Aouo-Token': getToken(),
    },
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })

  if (!res.ok) {
    const fallback = await res.json().catch(() => ({}))
    throw new Error(fallback.error ?? `Stream failed: ${res.status}`)
  }
  if (!res.body) {
    throw new Error('Stream response has no body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const block of parts) {
        const lines = block.split('\n').filter((l) => l && !l.startsWith(':'))
        const evLine = lines.find((l) => l.startsWith('event: '))
        const dataLine = lines.find((l) => l.startsWith('data: '))
        if (!evLine || !dataLine) continue
        const event = evLine.slice('event: '.length)
        let data: unknown = null
        try {
          data = JSON.parse(dataLine.slice('data: '.length))
        } catch {
          data = dataLine.slice('data: '.length)
        }
        onFrame({ event, data })
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // swallow
    }
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  put: <T>(path: string, data: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  post: <T>(path: string, data: unknown = {}) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  stream,
}
