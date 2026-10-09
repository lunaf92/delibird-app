import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { autofillLink, deleteItem, fetchItem, fetchLists, updateItem } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { saveImage } from '@/api/items';
import { useApi, useResource } from '@/api/use-api';
import { ItemForm, type ImageChange, type ItemValues } from '@/components/item-form';
import { Body, Button, Card, Heading, Message, Screen, Title } from '@/components/ui';

/** The changes were saved but the picture did not go through. */
class PictureFailed extends Error {}

export default function EditItemScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data: item, error: loadError } = useResource(
    useCallback((token: string, language: string) => fetchItem(token, id, language), [id]),
  );
  const { data: lists } = useResource(fetchLists);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState<{ values: ItemValues; image: ImageChange } | null>(null);
  // On a shared list someone may already have bought this item. The app never knows whether they did, so
  // it always asks before saving or deleting an item that is on any shared list.
  const shared = item?.on_shared_list ?? false;

  const submit = (values: ItemValues, image: ImageChange) => {
    if (shared) setPending({ values, image });
    else save(values, image);
  };

  const save = async (values: ItemValues, image: ImageChange) => {
    setPending(null);
    setBusy(true);
    setError(null);
    try {
      const saved = await api((token, language) => updateItem(token, id, values, language));
      try {
        await saveImage(api, saved, image);
      } catch (failure) {
        // The changes themselves are saved; say so, and Save tries the picture again.
        throw new PictureFailed(`${t('items.pictureFailedEdit')} ${errorMessage(failure, t)}`);
      }
      router.back();
    } catch (failure) {
      setError(failure instanceof PictureFailed ? failure.message : errorMessage(failure, t));
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api((token, language) => deleteItem(token, id, language));
      router.back();
    } catch (failure) {
      setError(errorMessage(failure, t));
      setBusy(false);
    }
  };

  if (!item || !lists) {
    return <Screen>{loadError ? <Message tone="error">{loadError}</Message> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Title>{t('items.editTitle')}</Title>
      {/* Keyed by id so the form starts from the loaded item. */}
      <ItemForm
        key={item.id}
        item={item}
        lists={lists}
        submitLabel={t('items.save')}
        busy={busy}
        error={error}
        onSubmit={submit}
        autofill={(link) => api((token, language) => autofillLink(token, link, language))}
      />

      {pending && (
        <Card>
          <Body>{t('items.sharedWarning')}</Body>
          <View style={styles.row}>
            <Button label={t('items.continue')} onPress={() => save(pending.values, pending.image)} />
            <Button variant="secondary" label={t('settings.cancel')} onPress={() => setPending(null)} />
          </View>
        </Card>
      )}

      <Heading>{t('items.deleteTitle')}</Heading>
      {confirmingDelete ? (
        <Card>
          {shared && <Body>{t('items.sharedWarning')}</Body>}
          <Body>{t('items.deleteWarning', { name: item.name })}</Body>
          <View style={styles.row}>
            <Button variant="danger" label={t('items.deleteConfirm')} onPress={remove} busy={busy} />
            <Button
              variant="secondary"
              label={t('settings.cancel')}
              onPress={() => setConfirmingDelete(false)}
            />
          </View>
        </Card>
      ) : (
        <Button variant="link" label={t('items.delete')} onPress={() => setConfirmingDelete(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
});
