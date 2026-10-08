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
      // Opened from a shared link (/add), there is no screen to go back to: show the list instead.
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/lists/[id]', params: { id: String(listId) } });
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
