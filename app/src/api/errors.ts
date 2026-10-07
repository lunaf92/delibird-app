import type { TFunction } from 'i18next';

import { ApiError } from './client';

/** A message to show for a failed request: the server's own (already translated) words when it sent some. */
export function errorMessage(error: unknown, t: TFunction, fallback = t('errors.generic')): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return t('errors.tooManyAttempts');
    return error.detail ?? fallback;
  }
  return t('errors.network');
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
