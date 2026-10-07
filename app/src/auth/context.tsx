import * as Device from 'expo-device';
import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { ApiError, fetchMe, logout, verify, type User, type VerifyRequest } from '@/api/client';
import { isSupportedLanguage } from '@/i18n';

import { loadToken, saveToken } from './storage';

type AuthState =
  | { status: 'loading'; token: null; user: null }
  | { status: 'signedOut'; token: null; user: null }
  // `user` is null while the profile is still loading, or when the server couldn't be reached at start-up.
  | { status: 'signedIn'; token: string; user: User | null };

type AuthContextValue = AuthState & {
  /** Exchanges a code or magic-link token for a session and signs this device in. */
  signIn: (credentials: Omit<VerifyRequest, 'device_name'>) => Promise<void>;
  /** Ends this device's session on the server (best effort) and forgets it here. */
  signOut: () => Promise<void>;
  /** Forgets the session on this device only, for example after the account was deleted. */
  forget: () => Promise<void>;
  /** Stores a fresh copy of the profile after it was changed on the server. */
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const LOADING: AuthState = { status: 'loading', token: null, user: null };
const SIGNED_OUT: AuthState = { status: 'signedOut', token: null, user: null };

/** A name for this device on the account's sessions list. On the web the server uses the browser's name. */
function deviceName(): string | undefined {
  if (Platform.OS === 'web') return undefined;
  return Device.deviceName ?? Device.modelName ?? Platform.OS;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Like useAuth, for screens that only render while signed in. */
export function useSignedIn() {
  const auth = useAuth();
  if (auth.status !== 'signedIn') throw new Error('useSignedIn needs a signed-in session');
  return auth;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const [state, setState] = useState<AuthState>(LOADING);

  const applyUser = useCallback(
    (user: User) => {
      if (isSupportedLanguage(user.language) && user.language !== i18n.language) {
        i18n.changeLanguage(user.language);
      }
    },
    [i18n],
  );

  // On start-up, pick up a saved session and check it is still valid.
  useEffect(() => {
    let active = true;
    (async () => {
      const token = await loadToken().catch(() => null);
      if (!active) return;
      if (!token) {
        setState(SIGNED_OUT);
        return;
      }
      setState({ status: 'signedIn', token, user: null });
      try {
        const user = await fetchMe(token, i18n.language);
        if (!active) return;
        applyUser(user);
        setState({ status: 'signedIn', token, user });
      } catch (error) {
        if (active && error instanceof ApiError && error.status === 401) {
          await saveToken(null);
          setState(SIGNED_OUT);
        }
        // Otherwise the server is unreachable: stay signed in and let screens retry.
      }
    })();
    return () => {
      active = false;
    };
    // Runs once; the language at start-up is good enough for this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (credentials) => {
      const name = deviceName();
      const { token, user } = await verify(
        { ...credentials, ...(name ? { device_name: name } : {}) },
        i18n.language,
      );
      await saveToken(token);
      applyUser(user);
      setState({ status: 'signedIn', token, user });
    },
    [applyUser, i18n],
  );

  const forget = useCallback(async () => {
    await saveToken(null);
    setState(SIGNED_OUT);
  }, []);

  const signOut = useCallback(async () => {
    if (state.token) await logout(state.token, i18n.language).catch(() => undefined);
    await forget();
  }, [forget, i18n, state.token]);

  const setUser = useCallback(
    (user: User) => {
      applyUser(user);
      setState((current) => (current.status === 'signedIn' ? { ...current, user } : current));
    },
    [applyUser],
  );

  const value = useMemo(
    () => ({ ...state, signIn, signOut, forget, setUser }),
    [state, signIn, signOut, forget, setUser],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}
