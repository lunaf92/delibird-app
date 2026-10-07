import { deleteItemImage, uploadItemImage, type Item } from './client';
import type { ImageChange } from '@/components/item-form';

type Api = <T>(call: (token: string, language: string) => Promise<T>) => Promise<T>;

/** Applies the picture part of the item form after the item itself was saved. */
export async function saveImage(api: Api, item: Item, change: ImageChange): Promise<Item> {
  if (change.kind === 'new')
    return api((token, language) => uploadItemImage(token, item.id, change.image, language));
  if (change.kind === 'remove') return api((token, language) => deleteItemImage(token, item.id, language));
  return item;
}
