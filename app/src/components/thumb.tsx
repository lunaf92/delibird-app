import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import { useLook } from '@/theme/context';
import { Hatch, sketchCorners } from '@/theme/sketch';

/** An item's picture, framed in pen; items without one get a pencil-shaded tile. */
export function Thumb({
  uri,
  seed,
  size = 72,
}: {
  uri: string | null | undefined;
  seed: number;
  size?: number;
}) {
  const { colors } = useLook();
  if (!uri) return <Hatch ink={colors.ink} bg={colors.bg} size={size} seed={seed} />;
  return (
    <Image
      source={{ uri }}
      style={[
        styles.frame,
        { width: size, height: size, borderColor: colors.ink },
        sketchCorners(seed % 2 === 1, true),
      ]}
      contentFit="cover"
    />
  );
}

const styles = StyleSheet.create({ frame: { borderWidth: 3 } });
