import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Item, PickedImage, Wishlist } from '@/api/client';

import { CURRENCIES, parsePrice } from './price';
import { RatingPicker } from './rating';
import { BLUE, Body, Button, Heading, Message, TextField } from './ui';

export type ImageChange = { kind: 'keep' } | { kind: 'new'; image: PickedImage } | { kind: 'remove' };

export type ItemValues = {
  name: string;
  url: string;
  description: string;
  rating: number | null;
  price: string | null;
  currency: string;
  wishlist?: number;
};

type Props = {
  item?: Item;
  /** The owner's lists, to move the item to another one. Left out when adding. */
  lists?: Wishlist[];
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (values: ItemValues, image: ImageChange) => void;
};

/** The item form: only the name is required. */
export function ItemForm({ item, lists, submitLabel, busy, error, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(item?.name ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [rating, setRating] = useState<number | null>(item?.rating ?? null);
  const [priceText, setPriceText] = useState(item?.price ?? '');
  const [currency, setCurrency] = useState(item?.currency ?? 'EUR');
  const [wishlist, setWishlist] = useState(item?.wishlist);
  const [image, setImage] = useState<ImageChange>({ kind: 'keep' });
  const [problem, setProblem] = useState<string | null>(null);

  const preview =
    image.kind === 'new' ? image.image.uri : image.kind === 'remove' ? null : (item?.image ?? null);
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
    if (trimmedUrl && !/^https?:\/\/\S+\.\S+/i.test(trimmedUrl)) return setProblem(t('items.urlInvalid'));
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
        ...(wishlist !== undefined && lists ? { wishlist } : {}),
      },
      image,
    );
  };

  return (
    <>
      <TextField
        label={t('items.name')}
        value={name}
        onChangeText={setName}
        maxLength={200}
        autoFocus={!item}
      />
      <TextField
        label={t('items.url')}
        value={url}
        onChangeText={setUrl}
        placeholder="https://"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        maxLength={2000}
      />
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
          <Heading>{t('items.list')}</Heading>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('items.list')}>
            {lists.map((list) => (
              <Chip
                key={list.id}
                label={list.name}
                selected={list.id === wishlist}
                onPress={() => setWishlist(list.id)}
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

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
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
  chipLabel: { color: BLUE, fontSize: 15 },
  chipLabelSelected: { color: '#FFFFFF', fontWeight: '600' },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: '#F2F4F7' },
});
