import { API_URL } from '@/api/client';

type Reply = { status?: number; body?: unknown };
type Handler = Reply | ((body: unknown) => Reply);

export type ApiCall = { method: string; path: string; body: unknown; headers: Record<string, string> };

export const HEALTHY = {
  status: 'ok',
  database: true,
  redis: true,
  language: 'en',
  message: 'The server is running.',
};

export const ANN = { id: 1, email: 'ann@example.com', display_name: 'Ann', language: 'en' as const };

export const DEFAULT_LIST = {
  id: 10,
  name: 'My wishlist',
  is_default: true,
  position: 0,
  item_count: 0,
  is_shared: false,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
};

export function item(fields: Record<string, unknown> = {}) {
  return {
    id: 100,
    lists: [10],
    on_shared_list: false,
    name: 'Book',
    url: '',
    description: '',
    rating: null,
    image: null,
    price: null,
    currency: 'EUR',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...fields,
  };
}

/**
 * Replaces fetch with a fake API. Handlers are keyed by "METHOD path", for example "POST auth/verify/".
 * A request without a handler fails like an unreachable server. Returns the list of calls made.
 */
export function mockApi(handlers: Record<string, Handler>): ApiCall[] {
  const calls: ApiCall[] = [];
  const all: Record<string, Handler> = {
    'GET health/': { body: HEALTHY },
    'GET lists/': { body: [DEFAULT_LIST] },
    'GET shared-with-me/': { body: [] },
    ...handlers,
  };
  globalThis.fetch = jest.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = String(url).replace(`${API_URL}/api/v1/`, '');
    // JSON bodies are decoded; anything else (such as a FormData upload) is passed through as it is.
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ method, path, body, headers: (init.headers ?? {}) as Record<string, string> });
    const handler = all[`${method} ${path}`];
    if (!handler) throw new TypeError(`Network request failed (no mock for ${method} ${path})`);
    const reply = typeof handler === 'function' ? handler(body) : handler;
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => reply.body ?? null } as Response;
  }) as typeof fetch;
  return calls;
}

export function callsTo(calls: ApiCall[], method: string, path: string): ApiCall[] {
  return calls.filter((call) => call.method === method && call.path === path);
}
