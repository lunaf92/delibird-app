import { getShareExtensionKey } from 'expo-share-intent';

/**
 * Something shared to Strena from another app arrives as a special link; send it to /add, which reads the
 * shared text. Every other link opens as usual.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return path.includes(`dataUrl=${getShareExtensionKey()}`) ? '/add' : path;
  } catch {
    return '/';
  }
}
