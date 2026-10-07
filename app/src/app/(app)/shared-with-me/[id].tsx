import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { ApiError, cancelReservation, fetchViewerList, reserveItem, type ViewerItem } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi, useResource } from '@/api/use-api';
import { SharedItemCard } from '@/components/shared-item';
import { Body, Button, Message, Screen, Title } from '@/components/ui';

/** A list someone shared with you: reserve what you'll get, and see what others are getting. */
export default function ViewerListScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const listId = Number(useLocalSearchParams<{ id: string }>().id);
  const {
    data: list,
    error,
    reload,
  } = useResource(
    useCallback((token: string, language: string) => fetchViewerList(token, listId, language), [listId]),
  );
  const [busyItem, setBusyItem] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (item: ViewerItem, action: typeof reserveItem) => {
    setBusyItem(item.id);
    setActionError(null);
    try {
      await api((token, language) => action(token, item.id, language));
    } catch (failure) {
      // 409: someone reserved it a moment ago. The reload below shows who.
      setActionError(
        failure instanceof ApiError && failure.status === 409 ? failure.detail : errorMessage(failure, t),
      );
    } finally {
      setBusyItem(null);
      reload();
    }
  };

  if (!list) {
    return <Screen>{error ? <Message tone="error">{error}</Message> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: list.name }} />
      <Title>{list.name}</Title>
      <Body muted>{t('shared.from', { name: list.owner_name })}</Body>
      <Body muted>{t('shared.secret', { name: list.owner_name })}</Body>
      <Message tone="error">{actionError}</Message>

      {list.items.length === 0 && <Body muted>{t('shared.empty')}</Body>}
      {list.items.map((item) => (
        <SharedItemCard key={item.id} item={item}>
          {item.reservation.status === 'free' && (
            <Button
              label={t('shared.reserve')}
              onPress={() => act(item, reserveItem)}
              busy={busyItem === item.id}
            />
          )}
          {item.reservation.status === 'mine' && (
            <>
              <Message tone="success">{t('shared.yours')}</Message>
              <Button
                variant="link"
                label={t('shared.cancel')}
                onPress={() => act(item, cancelReservation)}
                busy={busyItem === item.id}
              />
            </>
          )}
          {item.reservation.status === 'taken' && (
            <Body muted>{t('shared.takenBy', { name: item.reservation.by })}</Body>
          )}
        </SharedItemCard>
      ))}
    </Screen>
  );
}
