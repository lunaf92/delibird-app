import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { DEFAULT_SETTINGS, isDarkMode, isLookName, type LookSettings } from './looks';

// Before signing in, the look is kept on the device: localStorage on the web, secure storage on phones.
const KEY = 'strena.look';

function parse(saved: string | null | undefined): LookSettings {
  try {
    const value = saved ? (JSON.parse(saved) as Partial<LookSettings>) : {};
    return {
      theme: isLookName(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
      dark_mode: isDarkMode(value.dark_mode) ? value.dark_mode : DEFAULT_SETTINGS.dark_mode,
      plain_font: typeof value.plain_font === 'boolean' ? value.plain_font : DEFAULT_SETTINGS.plain_font,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function loadLook(): Promise<LookSettings> {
  if (Platform.OS === 'web') {
    try {
      return parse(globalThis.localStorage?.getItem(KEY));
    } catch {
      return DEFAULT_SETTINGS; // Storage blocked, for example in a private window.
    }
  }
  return parse(await SecureStore.getItemAsync(KEY).catch(() => null));
}

export async function saveLook(settings: LookSettings): Promise<void> {
  const value = JSON.stringify(settings);
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(KEY, value);
    } catch {
      // Without storage the look lasts until the tab closes.
    }
    return;
  }
  await SecureStore.setItemAsync(KEY, value).catch(() => undefined);
}
