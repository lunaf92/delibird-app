import type { PropsWithChildren } from 'react';

// The web has no share sheet to receive from; /add?url=… covers it instead.
export function SharedLinkProvider({ children }: PropsWithChildren) {
  return children;
}

export function useSharedLink(): { link: string | null; done: () => void } {
  return { link: null, done: () => undefined };
}
