import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { deleteList, fetchList, renameList, reorderItems, takeOffList, type Item } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi, useResource } from '@/api/use-api';
import { MoveButtons, moved } from '@/components/move-buttons';
import { formatPrice } from '@/components/price';
import { Stars } from '@/components/rating';
import { Thumb } from '@/components/thumb';
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

  const takeOff = async (item: Item) => {
    setActionError(null);
    try {
      await api((token, language) => takeOffList(token, id, item.id, language));
      reload();
    } catch (failure) {
      setActionError(errorMessage(failure, t));
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
          onTakeOff={list.is_default ? undefined : () => takeOff(item)}
        />
      ))}
      <Button
        label={t('items.add')}
        onPress={() => router.push({ pathname: '/lists/[id]/new', params: { id: String(id) } })}
      />
      {!list.is_default && (
        <Button
          variant="secondary"
          label={t('lists.addExisting')}
          onPress={() => router.push({ pathname: '/lists/[id]/add', params: { id: String(id) } })}
        />
      )}

      <Heading>{t('sharing.title')}</Heading>
      <Body muted>{list.is_shared ? t('sharing.isShared') : t('sharing.notShared')}</Body>
      <Button
        variant="secondary"
        label={t('sharing.manage')}
        onPress={() => router.push({ pathname: '/lists/[id]/sharing', params: { id: String(id) } })}
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
  onTakeOff,
}: {
  item: Item;
  language: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  /** Takes the item off this list (it stays on the others). Not offered on the default list. */
  onTakeOff?: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const price = formatPrice(item.price, item.currency, language);
  return (
    <Card flip={index % 2 === 1}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={item.name}
          style={[styles.row, styles.grow]}
          onPress={() => router.push({ pathname: '/items/[id]', params: { id: String(item.id) } })}>
          <Thumb uri={item.image} seed={item.id} size={64} />
          <View style={styles.grow}>
            <Body>{item.name}</Body>
            {price && <Body muted>{price}</Body>}
            <Stars value={item.rating} />
          </View>
        </Pressable>
        <MoveButtons name={item.name} index={index} count={count} onMove={onMove} />
      </View>
      {onTakeOff &&
        (confirming ? (
          <>
            {/* Someone may have bought it through this list; the app can't know, so it always asks. */}
            {item.on_shared_list && <Body>{t('items.sharedWarning')}</Body>}
            <View style={styles.row}>
              <Button variant="danger" label={t('lists.takeOffConfirm')} onPress={onTakeOff} />
              <Button variant="secondary" label={t('settings.cancel')} onPress={() => setConfirming(false)} />
            </View>
          </>
        ) : (
          <Button
            variant="link"
            label={t('lists.takeOff', { name: item.name })}
            onPress={() => (item.on_shared_list ? setConfirming(true) : onTakeOff())}
          />
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  grow: { flex: 1, gap: 2, minHeight: 44 },
});
