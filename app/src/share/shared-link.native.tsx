import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import type { PropsWithChildren } from 'react';

import { firstLink } from '@/api/links';

import type { SharedLink } from './shared-link';

/** Receives links shared to Strena from other apps' share sheets (Android). */
export function SharedLinkProvider({ children }: PropsWithChildren) {
  return <ShareIntentProvider options={{ resetOnBackground: true }}>{children}</ShareIntentProvider>;
}

/**
 * The link someone just shared to Strena, if any, and a way to mark it handled. `ready` turns true once the
 * share has been read (it arrives a moment after the app opens); `text` is what was shared, link or not.
 */
export function useSharedLink(): SharedLink {
  const { isReady, hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const text = hasShareIntent ? (shareIntent.text ?? shareIntent.webUrl ?? null) : null;
  const link = hasShareIntent
    ? (firstLink(shareIntent.webUrl ?? undefined) ?? firstLink(text ?? undefined))
    : null;
  return { link, text, ready: isReady, done: resetShareIntent };
}
