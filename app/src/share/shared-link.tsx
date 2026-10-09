import type { PropsWithChildren } from 'react';

// The web has no share sheet to receive from; /add?url=… covers it instead.
export function SharedLinkProvider({ children }: PropsWithChildren) {
  return children;
}

export type SharedLink = { link: string | null; text: string | null; done: () => void };

export function useSharedLink(): SharedLink {
  return { link: null, text: null, done: () => undefined };
}

/** Nothing to ask for on the web. */
export function askForShare() {}
