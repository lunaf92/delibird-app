// An in-memory stand-in for the phone's secure storage.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

// Push notifications: no native module in tests. Tests set `mockNotifications.*` to steer it.
jest.mock('expo-notifications', () => {
  const state = {
    lastResponse: null as unknown,
    permission: 'granted',
    pushToken: 'ExponentPushToken[test-phone]',
  };
  return {
    __state: state,
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ status: state.permission })),
    requestPermissionsAsync: jest.fn(async () => ({ status: state.permission })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: state.pushToken })),
    useLastNotificationResponse: () => state.lastResponse,
    AndroidImportance: { DEFAULT: 3 },
  };
});

// Receiving shares from other apps: tests set `shareIntent` through the module's __state.
jest.mock('expo-share-intent', () => {
  const state = { shareIntent: null as null | { text?: string; webUrl?: string | null } };
  return {
    __state: state,
    ShareIntentProvider: ({ children }: { children: unknown }) => children,
    useShareIntentContext: () => ({
      hasShareIntent: state.shareIntent !== null,
      shareIntent: state.shareIntent ?? {},
      resetShareIntent: () => {
        state.shareIntent = null;
      },
    }),
    getShareExtensionKey: () => 'delibirdShareKey',
  };
});

// Local files on a phone: a stand-in File (a Blob, as the real one is) that remembers which path it was made from.
jest.mock('expo-file-system', () => {
  const created: string[] = [];
  function LocalFile(uri: string) {
    created.push(uri);
    return new Blob(['picture']);
  }
  LocalFile.created = created;
  return { File: LocalFile };
});
