import * as SecureStore from 'expo-secure-store';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

export function storedToken(): string | undefined {
  return store.get('strena.session');
}

export function storeToken(token: string | null): void {
  if (token === null) store.delete('strena.session');
  else store.set('strena.session', token);
}
