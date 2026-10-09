import { startActivityAsync } from 'expo-intent-launcher';
import { Platform } from 'react-native';

/** Only Android can open "the email app" itself; elsewhere there is no standard way to reach an inbox. */
export function canOpenEmailApp(): boolean {
  return Platform.OS === 'android';
}

/** Opens the phone's default email app on its inbox, so the code is one tap away. */
export function openEmailApp(): Promise<void> {
  return startActivityAsync('android.intent.action.MAIN', {
    category: 'android.intent.category.APP_EMAIL',
    flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK: the email app opens on its own, not inside Strena.
  }).then(
    () => undefined,
    () => undefined, // No email app: nothing to open.
  );
}
