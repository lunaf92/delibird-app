import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { autofillLink, createItem } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { saveImage } from '@/api/items';
import { useApi } from '@/api/use-api';
import { ItemForm, type ImageChange, type ItemValues } from '@/components/item-form';
import { Screen, Title } from '@/components/ui';

export default function NewItemScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const params = useLocalSearchParams<{ id: string; url?: string }>();
  const listId = Number(params.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: ItemValues, image: ImageChange) => {
    setBusy(true);
    setError(null);
    try {
      const item = await api((token, language) => createItem(token, listId, values, language));
      await saveImage(api, item, image);
      // Started from a shared link (/add or the share sheet), "back" may be another app or an older form:
      // show the list the item went on instead.
      if (params.url || !router.canGoBack()) {
        router.replace({ pathname: '/lists/[id]', params: { id: String(listId) } });
      } else {
        router.back();
      }
    } catch (failure) {
      setError(errorMessage(failure, t));
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
