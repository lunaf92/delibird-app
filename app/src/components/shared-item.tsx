import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import type { SharedItem } from '@/api/client';

import { formatPrice } from './price';
import { Stars } from './rating';
import { Thumb } from './thumb';
import { Body, Button, Card } from './ui';

/** An item as someone the list is shared with sees it. `children` holds any reservation controls. */
export function SharedItemCard({ item, children }: PropsWithChildren<{ item: SharedItem }>) {
  const { t, i18n } = useTranslation();
  const price = formatPrice(item.price, item.currency, i18n.language);
  return (
    <Card flip={item.id % 2 === 1}>
      <View style={styles.row}>
        <Thumb uri={item.image} seed={item.id} />
        <View style={styles.grow}>
          <Body>{item.name}</Body>
          {price && <Body muted>{price}</Body>}
          <Stars value={item.rating} />
        </View>
      </View>
      {item.description ? <Body muted>{item.description}</Body> : null}
      {item.url ? (
        <Button variant="link" label={t('shared.openLink')} onPress={() => Linking.openURL(item.url)} />
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grow: { flex: 1, gap: 2 },
});
