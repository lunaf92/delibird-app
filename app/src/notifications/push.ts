import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { registerDevice, unregisterDevice } from '@/api/client';

const TOKEN_KEY = 'delibird.pushToken';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export type PushAvailability = 'available' | 'web' | 'simulator' | 'not-configured';

/** Push needs a real phone and a build linked to an EAS project; on the web, notifications come by email. */
export function pushAvailability(): PushAvailability {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'simulator';
  if (!projectId()) return 'not-configured';
  return 'available';
}

export async function savedPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

/** Asks for permission and registers this phone with the server. Returns false if permission was refused. */
export async function turnOnPush(session: string, language: string): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Delibird',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return false;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await registerDevice(session, token, Platform.OS === 'ios' ? 'ios' : 'android', language);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return true;
}

/** Stops push to this phone, for example when signing out. Best effort: signing out must not fail. */
export async function turnOffPush(session: string, language: string): Promise<void> {
  const token = await savedPushToken().catch(() => null);
  if (!token) return;
  await unregisterDevice(session, token, language).catch(() => undefined);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

/** The in-app path a tapped notification points at, if any. */
export function notificationPath(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const path = response?.notification.request.content.data?.path;
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : null;
}
