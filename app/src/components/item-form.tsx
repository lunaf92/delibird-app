import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, type Autofill, type Item, type PickedImage, type Wishlist } from '@/api/client';
import { nameFromLink } from '@/api/links';

import { CURRENCIES, parsePrice } from './price';
import { RatingPicker } from './rating';
import { BLUE, Body, Button, Heading, Message, TextField } from './ui';

export type ImageChange =
  | { kind: 'keep' }
  | { kind: 'new'; image: PickedImage }
  /** A picture found on a shop page; the server downloads it when the item is saved. */
  | { kind: 'url'; url: string }
  | { kind: 'remove' };

export type ItemValues = {
  name: string;
  url: string;
  description: string;
  rating: number | null;
  price: string | null;
  currency: string;
  /** Every list the item should be on. Only sent when editing; the default list is always included. */
  lists?: number[];
};

type Props = {
  item?: Item;
  /** The owner's lists, to choose which ones the item is on. Left out when adding. */
  lists?: Wishlist[];
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (values: ItemValues, image: ImageChange) => void;
  /** Reads a shop link and suggests details for the empty fields. */
  autofill: (url: string) => Promise<Autofill>;
  /** A link to start from, for example one shared from a shop's app; it is read straight away. */
  initialUrl?: string;
};

const LINK = /^https?:\/\/\S+\.\S+/i;

/** What to say when nothing could be read from a link, by the server's reason. */
const PROBLEM_TEXT = {
  none: 'items.autofillNothing',
  blocked: 'items.autofillBlocked',
  timeout: 'items.autofillTimeout',
  unreachable: 'items.autofillUnreachable',
  unreadable: 'items.autofillUnreadable',
} as const;

/** The item form: only the name is required. */
export function ItemForm({ item, lists, submitLabel, busy, error, onSubmit, autofill, initialUrl }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const [url, setUrl] = useState(item?.url ?? initialUrl ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [rating, setRating] = useState<number | null>(item?.rating ?? null);
  const [priceText, setPriceText] = useState(item?.price ?? '');
  const [currency, setCurrency] = useState(item?.currency ?? 'EUR');
  const [onLists, setOnLists] = useState<number[]>(item?.lists ?? []);
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' });
  const [problem, setProblem] = useState<string | null>(null);
  const [filling, setFilling] = useState(Boolean(initialUrl));
  const [fillNote, setFillNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  /** The name was guessed from the link because the page couldn't be read. */
  const [nameGuessed, setNameGuessed] = useState(false);
  // The name as last typed, for answers that arrive after the person has started typing.
  const typedName = useRef(name);
  useEffect(() => {
    typedName.current = name;
  }, [name]);
  const started = useRef(false);

  /** Fills only the fields that are still empty, so nothing the person typed is overwritten. */
  const apply = (found: Autofill) => {
    setFilling(false);
    setUrl(found.url);
    if (!found.found) {
      setFillNote({ tone: 'error', text: t(PROBLEM_TEXT[found.problem ?? 'none']) });
      const guess = nameFromLink(found.url);
      if (guess && !typedName.current.trim()) {
        setName(guess);
        setNameGuessed(true);
      }
      return;
    }
    setName((current) => current.trim() || found.name);
    setDescription((current) => current.trim() || found.description);
    // Price and currency go together: both are filled only when no price was typed yet.
    if (found.price && !priceText.trim()) {
      setPriceText(found.price);
      if (found.currency) setCurrency(found.currency);
    }
    if (found.image_url && !item?.image && image.kind === 'keep') {
      setImage({ kind: 'url', url: found.image_url });
    }
    setFillNote({ tone: 'success', text: t('items.autofillDone') });
  };

  const failed = (error: unknown) => {
    setFilling(false);
    let text = t('items.autofillNothing');
    // The only link the server refuses outright is one that isn't on the public internet.
    if (error instanceof ApiError && error.status === 400) text = t('items.autofillNotPublic');
    else if (error instanceof ApiError && error.detail) text = error.detail;
    setFillNote({ tone: 'error', text });
  };

  const fillFromLink = () => {
    const link = url.trim();
    if (!LINK.test(link)) {
      setFillNote({ tone: 'error', text: t('items.urlInvalid') });
      return;
    }
    setFilling(true);
    setFillNote(null);
    autofill(link).then(apply, failed);
  };

  // A link handed over when the form opens (from the share sheet or /add) is read straight away.
  useEffect(() => {
    if (!initialUrl || started.current) return;
    started.current = true;
    autofill(initialUrl).then(apply, failed);
    // Runs once, for the link the form opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview =
    image.kind === 'new'
      ? image.image.uri
      : image.kind === 'url'
        ? image.url
        : image.kind === 'remove'
          ? null
          : (item?.image ?? null);
  const currencies = CURRENCIES.includes(currency as (typeof CURRENCIES)[number])
    ? CURRENCIES
    : [...CURRENCIES, currency];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImage({
      kind: 'new',
      image: {
        uri: asset.uri,
        name: asset.fileName ?? 'photo.jpg',
        type: asset.mimeType ?? 'image/jpeg',
        file: asset.file,
      },
    });
  };

  const submit = () => {
    const trimmedUrl = url.trim();
    const price = priceText.trim() === '' ? null : parsePrice(priceText);
    if (!name.trim()) return setProblem(t('items.nameRequired'));
    if (trimmedUrl && !LINK.test(trimmedUrl)) return setProblem(t('items.urlInvalid'));
    if (priceText.trim() !== '' && price === null) return setProblem(t('items.priceInvalid'));
    setProblem(null);
    onSubmit(
      {
        name: name.trim(),
        url: trimmedUrl,
        description: description.trim(),
        rating,
        price,
        currency,
        ...(item && lists ? { lists: onLists } : {}),
      },
      image,
    );
  };

  const linkField = (
    <>
      <TextField
        label={t('items.url')}
        value={url}
        onChangeText={setUrl}
        onSubmitEditing={fillFromLink}
        placeholder="https://"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        maxLength={2000}
        autoFocus={!item && !initialUrl}
      />
      <Button
        variant="secondary"
        label={t('items.autofill')}
        onPress={fillFromLink}
        busy={filling}
        disabled={!url.trim()}
      />
      {fillNote && <Message tone={fillNote.tone}>{fillNote.text}</Message>}
    </>
  );

  return (
    <>
      {/* For a new item the shop link usually comes first: it fills in the rest. */}
      {!item && linkField}
      <TextField
        label={t('items.name')}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setNameGuessed(false);
        }}
        maxLength={200}
      />
      {nameGuessed && <Body muted>{t('items.nameGuessed')}</Body>}
      {item && linkField}
      <TextField
        label={t('items.description')}
        value={description}
        onChangeText={setDescription}
        placeholder={t('items.descriptionPlaceholder')}
        multiline
        maxLength={2000}
        style={styles.multiline}
      />

      <Heading>{t('items.rating')}</Heading>
      <Body muted>{t('items.ratingHelp')}</Body>
      <RatingPicker value={rating} onChange={setRating} />

      <TextField
        label={t('items.price')}
        value={priceText}
        onChangeText={setPriceText}
        placeholder="0.00"
        keyboardType="decimal-pad"
        inputMode="decimal"
      />
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('items.currency')}>
        {currencies.map((code) => (
          <Chip key={code} label={code} selected={code === currency} onPress={() => setCurrency(code)} />
        ))}
      </View>

      <Heading>{t('items.picture')}</Heading>
      {preview ? (
        <Image
          source={{ uri: preview }}
          style={styles.preview}
          contentFit="contain"
          accessibilityLabel={t('items.picture')}
        />
      ) : (
        <Body muted>{t('items.noPicture')}</Body>
      )}
      <View style={styles.row}>
        <Button
          variant="secondary"
          label={preview ? t('items.changePicture') : t('items.addPicture')}
          onPress={pickImage}
        />
        {preview && (
          <Button
            variant="link"
            label={t('items.removePicture')}
            onPress={() => setImage(item?.image ? { kind: 'remove' } : { kind: 'keep' })}
          />
        )}
      </View>

      {lists && lists.length > 1 && (
        <>
          <Heading>{t('items.lists')}</Heading>
          <Body muted>{t('items.listsHelp')}</Body>
          <View style={styles.chips}>
            {lists.map((list) => (
              <Chip
                key={list.id}
                role="checkbox"
                label={list.name}
                selected={list.is_default || onLists.includes(list.id)}
                // Every item stays on the default list; delete the item to remove it from there.
                disabled={list.is_default}
                onPress={() =>
                  setOnLists((current) =>
                    current.includes(list.id)
                      ? current.filter((id) => id !== list.id)
                      : [...current, list.id],
                  )
                }
              />
            ))}
          </View>
        </>
      )}

      <Message tone="error">{problem ?? error}</Message>
      <Button label={submitLabel} onPress={submit} busy={busy} />
    </>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox';
  disabled?: boolean;
};

function Chip({ label, selected, onPress, role = 'radio', disabled }: ChipProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }}
      // react-native-web doesn't turn accessibilityState.checked into aria-checked, so set it directly.
      aria-checked={role === 'checkbox' ? selected : undefined}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: BLUE, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  chipSelected: { backgroundColor: BLUE },
  chipDisabled: { opacity: 0.6 },
  chipLabel: { color: BLUE, fontSize: 15 },
  chipLabelSelected: { color: '#FFFFFF', fontWeight: '600' },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#F2F4F7' },
});
