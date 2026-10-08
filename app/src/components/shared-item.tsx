import { Image } from 'expo-image';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import type { SharedItem } from '@/api/client';

import { formatPrice } from './price';
import { Stars } from './rating';
import { Body, Button, Card } from './ui';

/** An item as someone the list is shared with sees it. `children` holds any reservation controls. */
export function SharedItemCard({ item, children }: PropsWithChildren<{ item: SharedItem }>) {
  const { t, i18n } = useTranslation();
  const price = formatPrice(item.price, item.currency, i18n.language);
  return (
    <Card>
      <View style={styles.row}>
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
      </View>
      {item.description ? <Body muted>{item.description}</Body> : null}
      {item.shop_url ? (
        <Button variant="link" label={t('shared.openLink')} onPress={() => Linking.openURL(item.shop_url)} />
      ) : null}
      {item.affiliate ? <Body muted>{t('shared.affiliateLink')}</Body> : null}
      {children}
    </Card>
  );
}

/** Says how affiliate links work, under a shared list that has any. */
export function AffiliateNote({ items }: { items: SharedItem[] }) {
  const { t } = useTranslation();
  if (!items.some((item) => item.affiliate)) return null;
  return <Body muted>{t('shared.affiliateAbout')}</Body>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 2 },
  thumb: { width: 64, height: 64, borderRadius: 8 },
  noThumb: { backgroundColor: '#E6EAF0' },
});
