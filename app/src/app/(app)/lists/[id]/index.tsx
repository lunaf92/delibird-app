import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { deleteList, fetchList, renameList, reorderItems, type Item } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi, useResource } from '@/api/use-api';
import { MoveButtons, moved } from '@/components/move-buttons';
import { formatPrice } from '@/components/price';
import { Stars } from '@/components/rating';
import { Body, Button, Card, Heading, Message, Screen, TextField, Title } from '@/components/ui';

/** One list: its items in order, and the list's own settings. */
export default function ListScreen() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const {
    data: list,
    setData: setList,
    error,
    reload,
  } = useResource(useCallback((token: string, language: string) => fetchList(token, id, language), [id]));
  const [actionError, setActionError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const move = async (from: number, to: number) => {
    if (!list) return;
    const items = moved(list.items, from, to);
    setList({ ...list, items });
    try {
      await api((token, language) =>
        reorderItems(
          token,
          id,
          items.map((item) => item.id),
          language,
        ),
      );
    } catch (failure) {
      setActionError(errorMessage(failure, t));
      reload();
    }
  };

  const rename = async () => {
    const name = renaming?.trim();
    if (!name || !list) return;
    setSaving(true);
    setActionError(null);
    try {
      setList(await api((token, language) => renameList(token, id, name, language)));
      setRenaming(null);
    } catch (failure) {
      setActionError(errorMessage(failure, t));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api((token, language) => deleteList(token, id, language));
      router.back();
    } catch (failure) {
      setActionError(errorMessage(failure, t));
      setSaving(false);
    }
  };

  if (!list) {
    return <Screen>{error ? <Message tone="error">{error}</Message> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: list.name }} />
      <Title>{list.name}</Title>
      <Message tone="error">{actionError}</Message>

      {list.items.length === 0 && <Body muted>{t('lists.empty')}</Body>}
      {list.items.map((item, index) => (
        <ItemRow
          key={item.id}
          item={item}
          language={i18n.language}
          index={index}
          count={list.items.length}
          onMove={move}
        />
      ))}
      <Button
        label={t('items.add')}
        onPress={() => router.push({ pathname: '/lists/[id]/new', params: { id: String(id) } })}
      />

      <Heading>{t('lists.settings')}</Heading>
      {renaming === null ? (
        <Button variant="link" label={t('lists.rename')} onPress={() => setRenaming(list.name)} />
      ) : (
        <>
          <TextField
            label={t('lists.name')}
            value={renaming}
            onChangeText={setRenaming}
            onSubmitEditing={rename}
            maxLength={100}
            autoFocus
          />
          <View style={styles.row}>
            <Button label={t('lists.saveName')} onPress={rename} busy={saving} disabled={!renaming.trim()} />
            <Button variant="secondary" label={t('settings.cancel')} onPress={() => setRenaming(null)} />
          </View>
        </>
      )}
      {list.is_default ? (
        <Body muted>{t('lists.defaultExplained')}</Body>
      ) : confirmingDelete ? (
        <Card>
          <Body>{t('lists.deleteWarning', { count: list.items.length })}</Body>
          <View style={styles.row}>
            <Button variant="danger" label={t('lists.deleteConfirm')} onPress={remove} busy={saving} />
            <Button
              variant="secondary"
              label={t('settings.cancel')}
              onPress={() => setConfirmingDelete(false)}
            />
          </View>
        </Card>
      ) : (
        <Button variant="link" label={t('lists.delete')} onPress={() => setConfirmingDelete(true)} />
      )}
    </Screen>
  );
}

function ItemRow({
  item,
  language,
  index,
  count,
  onMove,
}: {
  item: Item;
  language: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}) {
  const price = formatPrice(item.price, item.currency, language);
  return (
    <Card>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={item.name}
          style={[styles.row, styles.grow]}
          onPress={() => router.push({ pathname: '/items/[id]', params: { id: String(item.id) } })}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.noThumb]} />
          )}
          <View style={styles.grow}>
            <Body>{item.name}</Body>
            {price && <Body muted>{price}</Body>}
            <Stars value={item.rating} />
          </View>
        </Pressable>
        <MoveButtons name={item.name} index={index} count={count} onMove={onMove} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  grow: { flex: 1, gap: 2 },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  noThumb: { backgroundColor: '#E6EAF0' },
});
