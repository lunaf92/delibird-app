import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSignedIn } from '@/auth/context';

import { errorMessage, isUnauthorized } from './errors';

type Call<T> = (token: string, language: string) => Promise<T>;

/**
 * Runs API calls with this device's session and the app's language. A 401 means the session was ended
 * elsewhere (or the account deleted), so this device signs out too and the guard shows sign-in.
 */
export function useApi() {
  const { token, forget } = useSignedIn();
  const { i18n } = useTranslation();
  return useCallback(
    async <T>(call: Call<T>): Promise<T> => {
      try {
        return await call(token, i18n.language);
      } catch (error) {
        if (isUnauthorized(error)) await forget();
        throw error;
      }
    },
    [forget, i18n.language, token],
  );
}

/** Loads data when the screen opens and again whenever it comes back into view. */
export function useResource<T>(load: Call<T>) {
  const api = useApi();
  const { t } = useTranslation();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let active = true;
    api(load).then(
      (value) => {
        if (!active) return;
        setData(value);
        setError(null);
      },
      (failure: unknown) => {
        if (active && !isUnauthorized(failure)) setError(errorMessage(failure, t));
      },
    );
    return () => {
      active = false;
    };
  }, [api, load, t]);

  useFocusEffect(reload);

  return { data, setData, error, reload };
}
