import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { autofillLink, createItem, deleteItem, updateItem, type Item } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { saveImage } from '@/api/items';
import { useApi } from '@/api/use-api';
import { ItemForm, type ImageChange, type ItemValues } from '@/components/item-form';
import { Screen, Title } from '@/components/ui';

/** The item part of a save worked or was undone, but the picture did not go through. */
class PictureFailed extends Error {}

export default function NewItemScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const params = useLocalSearchParams<{ id: string; url?: string }>();
  const listId = Number(params.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An item that was created but whose picture is not stored yet, when removing it again failed too.
  const unfinished = useRef<Item | null>(null);

  const submit = async (values: ItemValues, image: ImageChange) => {
    setBusy(true);
    setError(null);
    try {
      // Saving is all or nothing: if the picture can't be stored, the new item is removed again, so nothing
      // is left half saved and the form still holds everything that was typed.
      const item = unfinished.current
        ? await api((token, language) => updateItem(token, unfinished.current!.id, values, language))
        : await api((token, language) => createItem(token, listId, values, language));
      try {
        await saveImage(api, item, image);
        unfinished.current = null;
      } catch (failure) {
        try {
          await api((token, language) => deleteItem(token, item.id, language));
          unfinished.current = null;
          throw new PictureFailed(`${t('items.pictureFailed')} ${errorMessage(failure, t)}`);
        } catch (removal) {
          if (removal instanceof PictureFailed) throw removal;
          // Removing it failed as well (the connection is down): the next Save only retries the picture.
          unfinished.current = item;
          throw new PictureFailed(`${t('items.pictureFailedKept')} ${errorMessage(failure, t)}`);
        }
      }
      // Started from a shared link (/add or the share sheet), "back" may be another app or an older form:
      // show the list the item went on instead.
      if (params.url || !router.canGoBack()) {
        router.replace({ pathname: '/lists/[id]', params: { id: String(listId) } });
      } else {
        router.back();
      }
    } catch (failure) {
      setError(failure instanceof PictureFailed ? failure.message : errorMessage(failure, t));
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('items.newTitle')}</Title>
      <ItemForm
        submitLabel={t('items.save')}
        busy={busy}
        error={error}
        onSubmit={submit}
        autofill={(link) => api((token, language) => autofillLink(token, link, language))}
        initialUrl={params.url}
      />
    </Screen>
  );
}
