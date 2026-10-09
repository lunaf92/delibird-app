import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import type { PropsWithChildren } from 'react';

import { firstLink } from '@/api/links';

/** Receives links shared to Strena from other apps' share sheets (Android). */
export function SharedLinkProvider({ children }: PropsWithChildren) {
  return <ShareIntentProvider options={{ resetOnBackground: true }}>{children}</ShareIntentProvider>;
}

/** The link someone just shared to Strena, if any, and a way to mark it handled. */
export function useSharedLink(): { link: string | null; done: () => void } {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const link = hasShareIntent ? (shareIntent.webUrl ?? firstLink(shareIntent.text ?? undefined)) : null;
  return { link, done: resetShareIntent };
}
