import * as SecureStore from 'expo-secure-store';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

export function storedToken(): string | undefined {
  return store.get('delibird.session');
}

export function storeToken(token: string | null): void {
  if (token === null) store.delete('delibird.session');
  else store.set('delibird.session', token);
}
