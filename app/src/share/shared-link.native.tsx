import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import ShareIntentModule from 'expo-share-intent/build/ExpoShareIntentModule';
import { useEffect, useSyncExternalStore, type PropsWithChildren } from 'react';

import { firstLink } from '@/api/links';

import type { SharedLink } from './shared-link';

/**
 * Receives links shared to Strena from other apps' share sheets (Android). Shares are not cleared when the app
 * goes to the background, which a share from another app's task can look like; /add clears it once used.
 * The library used to restart Strena in its own task in that case, running two copies of the app at once;
 * patches/expo-share-intent+8.0.1.patch turns that off.
 */
export function SharedLinkProvider({ children }: PropsWithChildren) {
  return <ShareIntentProvider options={{ resetOnBackground: false }}>{children}</ShareIntentProvider>;
}

// The shared text, kept outside React, so every screen sees the same share even if the app is mounted more
// than once (as it was while the library restarted it in its own task).
let sharedText: string | null = null;
const listeners = new Set<() => void>();

function setSharedText(text: string | null) {
  if (text === sharedText) return;
  sharedText = text;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Asks for a share that has reached the app but not its screens. The library only asks when the app opens
 * or comes back to the foreground; a share that arrives in between waits until asked for.
 */
export function askForShare() {
  if (ShareIntentModule?.hasShareIntent('')) ShareIntentModule.getShareIntent('');
}

/** Forgets the last share, as /add does once it has used it. */
export function clearSharedLink() {
  setSharedText(null);
}

/** The link someone just shared to Strena, if any, and a way to mark it handled. `text` is what was shared. */
export function useSharedLink(): SharedLink {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const incoming = hasShareIntent ? (shareIntent.text ?? shareIntent.webUrl ?? null) : null;
  useEffect(() => {
    if (incoming) setSharedText(incoming);
  }, [incoming]);
  const text = useSyncExternalStore(subscribe, () => sharedText);
  return {
    link: firstLink(text ?? undefined),
    text,
    done: () => {
      clearSharedLink();
      resetShareIntent();
    },
  };
}
