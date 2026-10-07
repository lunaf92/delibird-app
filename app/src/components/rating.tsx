import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const STARS = [1, 2, 3, 4, 5] as const;
const GOLD = '#E8A317';

/** Read-only stars, for item rows. */
export function Stars({ value }: { value: number | null }) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <Text accessibilityLabel={t('items.ratingValue', { count: value })} style={styles.small}>
      {'★'.repeat(value)}
      <Text style={styles.empty}>{'★'.repeat(5 - value)}</Text>
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
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('items.rating')}>
      {STARS.map((star) => (
        <Pressable
          key={star}
          accessibilityRole="radio"
          accessibilityLabel={t('items.ratingValue', { count: star })}
          accessibilityState={{ selected: value === star }}
          hitSlop={4}
          onPress={() => onChange(value === star ? null : star)}>
          <Text style={[styles.large, (value ?? 0) >= star ? styles.filled : styles.empty]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  small: { color: GOLD, fontSize: 14, letterSpacing: 1 },
  large: { fontSize: 30 },
  filled: { color: GOLD },
  empty: { color: '#C9CDD3' },
});
