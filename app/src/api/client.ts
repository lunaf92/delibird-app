/**
 * Base URL of the Django API. Set EXPO_PUBLIC_API_URL in app/.env to the machine's
 * LAN address (for example http://192.168.1.50:8000) so phones on the home Wi-Fi can reach it.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export type Health = {
  status: 'ok' | 'degraded';
  database: boolean;
  redis: boolean;
  language: string;
  message: string;
};

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
