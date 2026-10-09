import { Link, router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  createList,
  fetchLists,
  fetchSharedWithMe,
  reorderLists,
  type ViewerListSummary,
  type Wishlist,
} from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi, useResource } from '@/api/use-api';
import { useAuth } from '@/auth/context';
import { MoveButtons, moved } from '@/components/move-buttons';
import { Body, Button, Card, Heading, Message, Screen, TextField, Title } from '@/components/ui';
import { useLook } from '@/theme/context';

/** Home: the signed-in person's lists, in their order. */
export default function ListsScreen() {
  const { t } = useTranslation();
  const { colors, fonts } = useLook();
  const { user } = useAuth();
  const api = useApi();
  const { data: lists, setData: setLists, error, reload } = useResource(fetchLists);
  const { data: sharedWithMe } = useResource(fetchSharedWithMe);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const name = user?.display_name || user?.email;

  const create = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCreating(true);
    setActionError(null);
    try {
      const list = await api((token, language) => createList(token, trimmed, language));
      setNewName('');
      setLists((current) => [...(current ?? []), list]);
    } catch (failure) {
      setActionError(errorMessage(failure, t));
    } finally {
      setCreating(false);
    }
  };

  const move = async (from: number, to: number) => {
    if (!lists) return;
    const next = moved(lists, from, to);
    setLists(next);
    try {
      await api((token, language) =>
        reorderLists(
          token,
          next.map((list) => list.id),
          language,
        ),
      );
    } catch (failure) {
      setActionError(errorMessage(failure, t));
      reload();
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link
              href="/settings"
              style={[
                styles.headerLink,
                { color: colors.ink, fontFamily: fonts.body, fontSize: 18 * fonts.scale },
              ]}
              accessibilityRole="button">
              {t('settings.title')}
            </Link>
          ),
        }}
      />
      <Title>{name ? t('home.greeting', { name }) : t('home.greetingNoName')}</Title>
      <Heading>{t('lists.title')}</Heading>

      {lists === null && !error && <ActivityIndicator />}
      <Message tone="error">{error ?? actionError}</Message>
      {lists?.map((list, index) => (
        <ListRow key={list.id} list={list} index={index} count={lists.length} onMove={move} />
      ))}

      {sharedWithMe && sharedWithMe.length > 0 && (
        <>
          <Heading>{t('shared.withMe')}</Heading>
          {sharedWithMe.map((list) => (
            <SharedListRow key={list.id} list={list} />
          ))}
        </>
      )}

      <Heading>{t('lists.new')}</Heading>
      <TextField
        label={t('lists.name')}
        value={newName}
        onChangeText={setNewName}
        onSubmitEditing={create}
        placeholder={t('lists.namePlaceholder')}
        maxLength={100}
        returnKeyType="done"
      />
      <Button label={t('lists.create')} onPress={create} busy={creating} disabled={!newName.trim()} />
    </Screen>
  );
}

function ListRow({
  list,
  index,
  count,
  onMove,
}: {
  list: Wishlist;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card flip={index % 2 === 1}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={list.name}
          style={styles.grow}
          onPress={() => router.push({ pathname: '/lists/[id]', params: { id: String(list.id) } })}>
          <Body>{list.name}</Body>
          <Body muted>
            {t('lists.itemCount', { count: list.item_count })}
            {list.is_default ? ` · ${t('lists.default')}` : ''}
          </Body>
        </Pressable>
        <MoveButtons name={list.name} index={index} count={count} onMove={onMove} />
      </View>
    </Card>
  );
}

function SharedListRow({ list }: { list: ViewerListSummary }) {
  const { t } = useTranslation();
  return (
    <Card flip={list.id % 2 === 1}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={list.name}
        style={styles.grow}
        onPress={() => router.push({ pathname: '/shared-with-me/[id]', params: { id: String(list.id) } })}>
        <Body>{list.name}</Body>
        <Body muted>
          {t('shared.from', { name: list.owner_name })} · {t('lists.itemCount', { count: list.item_count })}
        </Body>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  headerLink: { textDecorationLine: 'underline', paddingHorizontal: 12, paddingVertical: 10 },
});
