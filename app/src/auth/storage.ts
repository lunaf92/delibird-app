import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// The session token lives in the phone's secure storage, and in localStorage on the web.
const KEY = 'delibird.session';

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
