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

export const api = {
  get: <T>(path: string) => request<T>(path),

  put: <T>(path: string, data: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
