import { deleteItemImage, imageFromUrl, uploadItemImage, type Item } from './client';
import type { ImageChange } from '@/components/item-form';

type Api = <T>(call: (token: string, language: string) => Promise<T>) => Promise<T>;

/** Applies the picture part of the item form after the item itself was saved. */
export async function saveImage(api: Api, item: Item, change: ImageChange): Promise<Item> {
  if (change.kind === 'new')
    return api((token, language) => uploadItemImage(token, item.id, change.image, language));
  if (change.kind === 'remove') return api((token, language) => deleteItemImage(token, item.id, language));
  if (change.kind === 'url') {
    // The item is already saved; a shop picture that can't be downloaded just leaves it without one.
    return api((token, language) => imageFromUrl(token, item.id, change.url, language)).catch(() => item);
  }
  return item;
}
