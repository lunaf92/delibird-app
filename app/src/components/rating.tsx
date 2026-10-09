import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLook } from '@/theme/context';

const STARS = [1, 2, 3, 4, 5] as const;

/** Read-only stars, for item rows. */
export function Stars({ value }: { value: number | null }) {
  const { t } = useTranslation();
  const { colors } = useLook();
  if (!value) return null;
  // Filled and outline stars, so the rating reads by shape and not only by colour.
  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel={t('items.ratingValue', { count: value })}
      style={[styles.small, { color: colors.ink }]}>
      {'★'.repeat(value)}
      {'☆'.repeat(5 - value)}
    </Text>
  );
}

/** Tap a star to rate; tap the same star again to clear the rating. */
export function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useLook();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('items.rating')}>
      {STARS.map((star) => (
        <Pressable
          key={star}
          accessibilityRole="radio"
          accessibilityLabel={t('items.ratingValue', { count: star })}
          accessibilityState={{ selected: value === star }}
          style={styles.target}
          onPress={() => onChange(value === star ? null : star)}>
          <Text style={[styles.large, { color: colors.ink }]}>{(value ?? 0) >= star ? '★' : '☆'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  small: { fontSize: 16, letterSpacing: 1 },
  target: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  large: { fontSize: 32 },
});
