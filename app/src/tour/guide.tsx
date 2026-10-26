import { router } from 'expo-router';
import { createContext, use, useMemo, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { createList, type Item, type Wishlist } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi } from '@/api/use-api';
import { Body, Button, Message, TextField } from '@/components/ui';
import { useLook } from '@/theme/context';
import { sketchCorners } from '@/theme/sketch';

/**
 * The guided first item, offered at the end of the welcome tour and from Settings: add something to a list,
 * then put it on a second list too. It only lives in memory; closing the app ends it.
 */
type GuideState =
  /** Adding the first item: open a list, tap "Add an item", fill in the form and save. */
  | { step: 'add' }
  /** The item is saved; next it needs a second list, made here if there is none yet. */
  | { step: 'secondList'; item: Item }
  /** Open the item and tick the second list (`list` is null when the person already had several). */
  | { step: 'tick'; item: Item; list: Wishlist | null }
  | { step: 'done'; item: Item };

type GuideValue = {
  state: GuideState | null;
  /** Starts the guide on the main list, or on the lists when it isn't known. */
  start: (mainListId?: number) => void;
  stop: () => void;
  /** A new item was saved. */
  itemAdded: (item: Item) => void;
  /** A second list was made for the guide's item. */
  listMade: (list: Wishlist) => void;
  /** An item was edited and saved. */
  itemSaved: (item: Item) => void;
};

const GuideContext = createContext<GuideValue | null>(null);

const OFF: GuideValue = {
  state: null,
  start: () => undefined,
  stop: () => undefined,
  itemAdded: () => undefined,
  listMade: () => undefined,
  itemSaved: () => undefined,
};

export function useGuide(): GuideValue {
  return use(GuideContext) ?? OFF;
}

export function GuideProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<GuideState | null>(null);

  const value = useMemo<GuideValue>(
    () => ({
      state,
      start: (mainListId) => {
        setState({ step: 'add' });
        if (mainListId === undefined) router.replace('/');
        else router.replace({ pathname: '/lists/[id]', params: { id: String(mainListId) } });
      },
      stop: () => setState(null),
      itemAdded: (item) =>
        setState((current) =>
          current?.step !== 'add'
            ? current
            : // Ticked onto a second list straight away in the form: nothing left to show but the end.
              item.lists.length > 1
              ? { step: 'done', item }
              : { step: 'secondList', item },
        ),
      listMade: (list) =>
        setState((current) =>
          current?.step === 'secondList' ? { step: 'tick', item: current.item, list } : current,
        ),
      itemSaved: (item) =>
        setState((current) =>
          (current?.step === 'tick' || current?.step === 'secondList') &&
          current.item.id === item.id &&
          item.lists.length > 1
            ? { step: 'done', item }
            : current,
        ),
    }),
    [state],
  );

  return <GuideContext value={value}>{children}</GuideContext>;
}

/** The guide's note at the top of a screen, saying what to do there. */
function Note({ step, children }: PropsWithChildren<{ step: number }>) {
  const { t } = useTranslation();
  const { colors, fonts } = useLook();
  const { stop } = useGuide();
  return (
    <View
      testID="guide-note"
      accessibilityLiveRegion="polite"
      style={[styles.note, { borderColor: colors.accent, backgroundColor: colors.bg }, sketchCorners(true)]}>
      <Text style={{ color: colors.ink, fontFamily: fonts.heading, fontSize: Math.round(15 * fonts.scale) }}>
        {t('guide.label', { step })}
      </Text>
      {children}
      <View style={styles.row}>
        <Button variant="link" label={t('guide.stop')} onPress={stop} />
      </View>
    </View>
  );
}

/** On the home screen: open a list to start. */
export function HomeGuide() {
  const { t } = useTranslation();
  const { state } = useGuide();
  if (state?.step !== 'add') return null;
  return (
    <Note step={1}>
      <Body>{t('guide.openList')}</Body>
    </Note>
  );
}

/** On the new item form. */
export function NewItemGuide() {
  const { t } = useTranslation();
  const { state } = useGuide();
  if (state?.step !== 'add') return null;
  return (
    <Note step={2}>
      <Body>{t('guide.fillForm')}</Body>
    </Note>
  );
}

/** On the item's own page, while it should be ticked onto a second list. */
export function EditItemGuide({ itemId, lists }: { itemId: number; lists: Wishlist[] }) {
  const { t } = useTranslation();
  const { state } = useGuide();
  if (!state || (state.step !== 'tick' && state.step !== 'secondList') || state.item.id !== itemId) {
    return null;
  }
  // Still to make a second list: there is nothing to tick unless the person already had one.
  if (state.step === 'secondList' && lists.length < 2) return null;
  const list = state.step === 'tick' ? state.list : null;
  return (
    <Note step={4}>
      <Body>{list ? t('guide.tick', { list: list.name }) : t('guide.tickAny')}</Body>
    </Note>
  );
}

/** On a list: most of the guide happens here. `lists` are the person's lists, once loaded. */
export function ListGuide({ lists }: { lists: Wishlist[] | null }) {
  const { t } = useTranslation();
  const { state, stop } = useGuide();
  if (!state) return null;
  switch (state.step) {
    case 'add':
      return (
        <Note step={1}>
          <Body>{t('guide.tapAdd')}</Body>
        </Note>
      );
    case 'secondList':
      // Someone who already has other lists can tick one of those instead of making a new one.
      if (lists && lists.length > 1) {
        return (
          <Note step={3}>
            <Body>{t('guide.openItemAny', { name: state.item.name })}</Body>
          </Note>
        );
      }
      return <SecondListNote item={state.item} />;
    case 'tick':
      return (
        <Note step={4}>
          <Body>
            {state.list
              ? t('guide.openItem', { name: state.item.name, list: state.list.name })
              : t('guide.openItemAny', { name: state.item.name })}
          </Body>
        </Note>
      );
    case 'done':
      return (
        <Note step={4}>
          <Body>{t('guide.done', { name: state.item.name })}</Body>
          <Button label={t('guide.finish')} onPress={stop} />
        </Note>
      );
  }
}

function SecondListNote({ item }: { item: Item }) {
  const { t } = useTranslation();
  const api = useApi();
  const { listMade } = useGuide();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      listMade(await api((token, language) => createList(token, trimmed, language)));
    } catch (failure) {
      setError(errorMessage(failure, t));
      setBusy(false);
    }
  };

  return (
    <Note step={3}>
      <Body>{t('guide.secondList', { name: item.name })}</Body>
      <TextField
        label={t('guide.secondListName')}
        value={name}
        onChangeText={setName}
        onSubmitEditing={create}
        placeholder={t('lists.namePlaceholder')}
        maxLength={100}
        returnKeyType="done"
      />
      <Message tone="error">{error}</Message>
      <Button label={t('guide.createList')} onPress={create} busy={busy} disabled={!name.trim()} />
    </Note>
  );
}

const styles = StyleSheet.create({
  note: { borderWidth: 3, borderStyle: 'dashed', padding: 14, gap: 8 },
  row: { flexDirection: 'row' },
});
