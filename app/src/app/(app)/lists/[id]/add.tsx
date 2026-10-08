import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { fetchList, fetchLists, putOnList } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi, useResource } from '@/api/use-api';
import { formatPrice } from '@/components/price';
import { Body, Button, Card, Message, Screen, Title } from '@/components/ui';

/** Picks items you already have (they all live on your default list) to put on this list too. */
export default function AddExistingScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const listId = Number(useLocalSearchParams<{ id: string }>().id);
  const { data, error } = useResource(
    useCallback(
      async (token: string, language: string) => {
        const lists = await fetchLists(token, language);
        const target = lists.find((list) => list.id === listId);
        const all = lists.find((list) => list.is_default);
        if (!target || !all) throw new Error('List not found');
        return { target, items: (await fetchList(token, all.id, language)).items };
      },
      [listId],
    ),
  );
  const [added, setAdded] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const add = async (itemId: number) => {
    setBusy(itemId);
    setActionError(null);
    try {
      await api((token, language) => putOnList(token, listId, itemId, language));
      setAdded((current) => [...current, itemId]);
    } catch (failure) {
      setActionError(errorMessage(failure, t));
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <Screen>{error ? <Message tone="error">{error}</Message> : <ActivityIndicator />}</Screen>;
  }

  const candidates = data.items.filter((item) => !item.lists.includes(listId) || added.includes(item.id));
  return (
    <Screen>
      <Title>{t('lists.addExistingTitle', { name: data.target.name })}</Title>
      <Body muted>{t('lists.addExistingIntro')}</Body>
      <Message tone="error">{actionError}</Message>
      {candidates.length === 0 && <Body muted>{t('lists.nothingToAdd')}</Body>}
      {candidates.map((item) => {
        const price = formatPrice(item.price, item.currency, i18n.language);
        return (
          <Card key={item.id}>
            <Body>{item.name}</Body>
            {price && <Body muted>{price}</Body>}
            {added.includes(item.id) ? (
              <Message tone="success">{t('lists.added')}</Message>
            ) : (
              <Button
                variant="secondary"
                label={t('lists.addThis', { name: item.name })}
                onPress={() => add(item.id)}
                busy={busy === item.id}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
