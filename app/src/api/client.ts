import type { components } from './schema';

/**
 * Base URL of the Django API. Set EXPO_PUBLIC_API_URL in app/.env to the machine's
 * LAN address (for example http://192.168.1.50:8000) so phones on the home Wi-Fi can reach it.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

// Types come from the backend's OpenAPI schema: run `npm run api:types` after changing the API.
type Schemas = components['schemas'];
export type Health = Schemas['Health'];
export type User = Schemas['User'];
export type UserUpdate = Schemas['PatchedUserRequest'];
export type Session = Schemas['Session'];
export type SignedIn = Schemas['SignedIn'];
export type VerifyRequest = Schemas['VerifyRequest'];

/** The server answered with an error status. `detail` is its message, already in the request's language. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  language: string;
};

async function request<T>(
  path: string,
  { method = 'GET', body, token, language }: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': language };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/api/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : null;
    throw new ApiError(response.status, detail);
  }
  return data as T;
}

/** Calls GET /api/v1/health/. A degraded server answers 503 with the same body, so both are returned. */
export async function fetchHealth(language: string): Promise<Health> {
  const response = await fetch(`${API_URL}/api/v1/health/`, {
    headers: { Accept: 'application/json', 'Accept-Language': language },
  });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }
  return (await response.json()) as Health;
}

export function requestCode(email: string, language: string): Promise<{ detail: string }> {
  return request('auth/request-code/', { method: 'POST', body: { email }, language });
}

export function verify(body: VerifyRequest, language: string): Promise<SignedIn> {
  return request('auth/verify/', { method: 'POST', body, language });
}

export function logout(token: string, language: string): Promise<void> {
  return request('auth/logout/', { method: 'POST', token, language });
}

export function fetchMe(token: string, language: string): Promise<User> {
  return request('me/', { token, language });
}

export function updateMe(token: string, changes: UserUpdate, language: string): Promise<User> {
  return request('me/', { method: 'PATCH', body: changes, token, language });
}

export function deleteMe(token: string, language: string): Promise<void> {
  return request('me/', { method: 'DELETE', token, language });
}

export function fetchSessions(token: string, language: string): Promise<Session[]> {
  return request('auth/sessions/', { token, language });
}

export function endSession(token: string, id: number, language: string): Promise<void> {
  return request(`auth/sessions/${id}/`, { method: 'DELETE', token, language });
}
