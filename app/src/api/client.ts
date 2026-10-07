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
export type Wishlist = Schemas['Wishlist'];
export type WishlistDetail = Schemas['WishlistDetail'];
export type Item = Schemas['Item'];
export type ItemInput = Schemas['ItemRequest'];
export type ItemUpdate = Schemas['PatchedItemRequest'];

export type Share = Schemas['Share'];
export type NewShare = Schemas['NewShare'];
export type SharedList = Schemas['SharedList'];
export type SharedItem = Schemas['SharedItem'];
export type ViewerList = Schemas['ViewerList'];
export type ViewerListSummary = Schemas['ViewerListSummary'];
export type ViewerItem = Schemas['ViewerItem'];

/** A picture chosen on the device: a File on the web, a local file URI on phones. */
export type PickedImage = { uri: string; name: string; type: string; file?: Blob };

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
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  language: string;
};

async function request<T>(
  path: string,
  { method = 'GET', body, token, language }: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': language };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  // Multipart bodies set their own Content-Type, with the boundary.
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/api/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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

export function fetchLists(token: string, language: string): Promise<Wishlist[]> {
  return request('lists/', { token, language });
}

export function createList(token: string, name: string, language: string): Promise<Wishlist> {
  return request('lists/', { method: 'POST', body: { name }, token, language });
}

export function fetchList(token: string, id: number, language: string): Promise<WishlistDetail> {
  return request(`lists/${id}/`, { token, language });
}

export function renameList(
  token: string,
  id: number,
  name: string,
  language: string,
): Promise<WishlistDetail> {
  return request(`lists/${id}/`, { method: 'PATCH', body: { name }, token, language });
}

export function deleteList(token: string, id: number, language: string): Promise<void> {
  return request(`lists/${id}/`, { method: 'DELETE', token, language });
}

export function reorderLists(token: string, ids: number[], language: string): Promise<void> {
  return request('lists/reorder/', { method: 'POST', body: { ids }, token, language });
}

export function createItem(token: string, listId: number, item: ItemInput, language: string): Promise<Item> {
  return request(`lists/${listId}/items/`, { method: 'POST', body: item, token, language });
}

export function reorderItems(token: string, listId: number, ids: number[], language: string): Promise<void> {
  return request(`lists/${listId}/items/reorder/`, { method: 'POST', body: { ids }, token, language });
}

export function fetchItem(token: string, id: number, language: string): Promise<Item> {
  return request(`items/${id}/`, { token, language });
}

export function updateItem(token: string, id: number, changes: ItemUpdate, language: string): Promise<Item> {
  return request(`items/${id}/`, { method: 'PATCH', body: changes, token, language });
}

export function deleteItem(token: string, id: number, language: string): Promise<void> {
  return request(`items/${id}/`, { method: 'DELETE', token, language });
}

export function uploadItemImage(
  token: string,
  id: number,
  image: PickedImage,
  language: string,
): Promise<Item> {
  const form = new FormData();
  if (image.file) form.append('image', image.file, image.name);
  // React Native's FormData takes a { uri, name, type } object for local files.
  else form.append('image', { uri: image.uri, name: image.name, type: image.type } as unknown as Blob);
  return request(`items/${id}/image/`, { method: 'PUT', body: form, token, language });
}

export function deleteItemImage(token: string, id: number, language: string): Promise<Item> {
  return request(`items/${id}/image/`, { method: 'DELETE', token, language });
}

export function fetchShares(token: string, listId: number, language: string): Promise<Share[]> {
  return request(`lists/${listId}/shares/`, { token, language });
}

export function createShare(
  token: string,
  listId: number,
  email: string,
  language: string,
): Promise<NewShare> {
  return request(`lists/${listId}/shares/`, { method: 'POST', body: { email }, token, language });
}

export function stopSharing(token: string, shareId: number, language: string): Promise<void> {
  return request(`shares/${shareId}/`, { method: 'DELETE', token, language });
}

/** Opens a share link. Works signed out; signed in, the answer says how this person relates to the list. */
export function fetchSharedList(
  token: string | null,
  shareToken: string,
  language: string,
): Promise<SharedList> {
  return request(`shared/${encodeURIComponent(shareToken)}/`, { token, language });
}

export function joinSharedList(
  token: string,
  shareToken: string,
  language: string,
): Promise<ViewerListSummary> {
  return request(`shared/${encodeURIComponent(shareToken)}/join/`, { method: 'POST', token, language });
}

export function fetchSharedWithMe(token: string, language: string): Promise<ViewerListSummary[]> {
  return request('shared-with-me/', { token, language });
}

export function fetchViewerList(token: string, listId: number, language: string): Promise<ViewerList> {
  return request(`shared-with-me/${listId}/`, { token, language });
}

export function reserveItem(token: string, itemId: number, language: string): Promise<void> {
  return request(`items/${itemId}/reservation/`, { method: 'POST', token, language });
}

export function cancelReservation(token: string, itemId: number, language: string): Promise<void> {
  return request(`items/${itemId}/reservation/`, { method: 'DELETE', token, language });
}
