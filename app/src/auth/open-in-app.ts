import { Platform } from 'react-native';

export const APP_SCHEME = 'delibird';
export const ANDROID_PACKAGE = 'com.lunaf92.delibird';

/** True in an Android web browser, the only place the sign-in link can hand over to the installed app. */
export function canOpenAppFromBrowser(userAgent: string = globalThis.navigator?.userAgent ?? ''): boolean {
  return Platform.OS === 'web' && /android/i.test(userAgent);
}

/**
 * An Android "intent" link: Chrome opens the app if it is installed, and goes to `fallbackUrl` (the same sign-in on
 * the website) if it is not. Plain-HTTP links can't be verified App Links, so this handoff stands in for them.
 */
export function androidIntentUrl(token: string, fallbackUrl: string): string {
  return (
    `intent://sign-in/verify?token=${encodeURIComponent(token)}` +
    `#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
  );
}
