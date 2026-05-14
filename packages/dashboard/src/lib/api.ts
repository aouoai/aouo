/**
 * API client for communicating with the aouo agent server.
 *
 * Token is read from the URL search params on first load and attached
 * to all subsequent requests via the X-Aouo-Token header.
 */

let _token: string | null = null

function getToken(): string {
  if (!_token) {
    _token = new URL(window.location.href).searchParams.get('token') ?? ''
  }
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
