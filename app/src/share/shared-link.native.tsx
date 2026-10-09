import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import type { PropsWithChildren } from 'react';

import { firstLink } from '@/api/links';

import type { SharedLink } from './shared-link';

/**
 * Receives links shared to Strena from other apps' share sheets (Android). Shares are not cleared when the app
 * goes to the background: a share from another app's task (Amazon's, for one) restarts Strena in its own task,
 * which looks like going to the background and would wipe the share before it is read. /add clears it once used.
 */
export function SharedLinkProvider({ children }: PropsWithChildren) {
  return <ShareIntentProvider options={{ resetOnBackground: false }}>{children}</ShareIntentProvider>;
}

/** The link someone just shared to Strena, if any, and a way to mark it handled. `text` is what was shared. */
export function useSharedLink(): SharedLink {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const text = hasShareIntent ? (shareIntent.text ?? shareIntent.webUrl ?? null) : null;
  const link = hasShareIntent
    ? (firstLink(shareIntent.webUrl ?? undefined) ?? firstLink(text ?? undefined))
    : null;
  return { link, text, done: resetShareIntent };
}
