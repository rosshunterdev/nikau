import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_CORE_API_URL

// An error from the Core API, with its status code (401, 404, 422...)
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Call the Core API with the signed-in user's token attached.
// Usage: const clients = await api<ClientSummary[]>('/clients')
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Get the current sign-in token from Supabase
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  // Not 2xx: turn it into an ApiError with the API's message
  if (!res.ok) {
    const body = await res.json().catch(() => null)

    // 400/403/404: detail is a string. 422 (Pydantic): detail is a list of problems.
    let message = 'Something went wrong'
    if (typeof body?.detail === 'string') {
      message = body.detail
    } else if (Array.isArray(body?.detail) && body.detail[0]?.msg) {
      const first = body.detail[0]
      const text = first.msg.replace(/^Value error, /, '')
      // loc is like ["body", "min_age"]: name the field if there is one
      const field = first.loc?.at(-1)
      message =
        typeof field === 'string' && field !== 'body'
          ? `${field.replace(/_/g, ' ')}: ${text}`
          : text
    }

    throw new ApiError(res.status, message)
  }

  return res.json() as Promise<T>
}
