import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The session token lives in the phone's secure storage, and in localStorage on the web.
const KEY = 'strena.session';

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null; // Storage blocked, for example in a private window.
    }
  }
  return SecureStore.getItemAsync(KEY);
}

export async function saveToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (token === null) globalThis.localStorage?.removeItem(KEY);
      else globalThis.localStorage?.setItem(KEY, token);
    } catch {
      // Without storage the session lasts until the tab closes.
    }
    return;
  }
  if (token === null) await SecureStore.deleteItemAsync(KEY);
  else await SecureStore.setItemAsync(KEY, token);
}

// Where to go after signing in, for example a share link opened while signed out. Kept in localStorage on
// the web so it survives the magic link opening in a new tab; in memory on phones.
const RETURN_KEY = 'strena.returnTo';
let returnTo: string | null = null;

export function rememberReturnTo(path: string | null): void {
  returnTo = path;
  if (Platform.OS !== 'web') return;
  try {
    if (path === null) globalThis.localStorage?.removeItem(RETURN_KEY);
    else globalThis.localStorage?.setItem(RETURN_KEY, path);
  } catch {
    // Storage blocked: the in-memory copy still works within this tab.
  }
}

/** Returns the remembered path once, then forgets it. */
export function takeReturnTo(): string | null {
  let path = returnTo;
  if (Platform.OS === 'web') {
    try {
      path = path ?? globalThis.localStorage?.getItem(RETURN_KEY) ?? null;
    } catch {
      // Ignore: fall back to the in-memory copy.
    }
  }
  rememberReturnTo(null);
  return path;
}
