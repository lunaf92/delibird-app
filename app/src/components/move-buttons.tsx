import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLook } from '@/theme/context';
import { offsetShadow, sketchCorners } from '@/theme/sketch';

type Props = { name: string; index: number; count: number; onMove: (from: number, to: number) => void };

/** Up and down buttons for reordering; they work the same with a mouse, a finger or a screen reader. */
export function MoveButtons({ name, index, count, onMove }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Arrow
        label={t('reorder.up', { name })}
        symbol="↑"
        disabled={index === 0}
        onPress={() => onMove(index, index - 1)}
      />
      <Arrow
        label={t('reorder.down', { name })}
        symbol="↓"
        disabled={index === count - 1}
        onPress={() => onMove(index, index + 1)}
      />
    </View>
  );
}

function Arrow({
  label,
  symbol,
  disabled,
  onPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useLook();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.arrow,
        sketchCorners(symbol === '↓', true),
        { borderColor: colors.ink, backgroundColor: colors.bg },
        !disabled && offsetShadow(colors.ink, 3),
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.symbol, { color: colors.ink }]}>{symbol}</Text>
    </Pressable>
  );
}

/** Returns a copy of `items` with the element at `from` moved to `to`. */
export function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  arrow: { width: 44, height: 44, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  symbol: { fontSize: 20, fontWeight: '700' },
});
