import { useId } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';

/**
 * Wobbly, hand-drawn corners. On the web they are the uneven elliptical corners of the design; phones only
 * draw circular corners, so there each corner gets a different size instead. `flip` mirrors the shape, so
 * neighbouring boxes don't look stamped out of one mould.
 */
type Corners = {
  borderTopLeftRadius: number | string;
  borderTopRightRadius: number | string;
  borderBottomRightRadius: number | string;
  borderBottomLeftRadius: number | string;
};

export function sketchCorners(flip = false, small = false): Corners {
  if (Platform.OS === 'web') {
    const [a, b, c, d] = small
      ? ['30px 8px', '6px 28px', '28px 6px', '8px 30px']
      : ['255px 15px', '15px 225px', '225px 15px', '15px 255px'];
    const [e, f, g, h] = small
      ? ['8px 30px', '28px 6px', '6px 28px', '30px 8px']
      : ['15px 255px', '225px 15px', '15px 225px', '255px 15px'];
    const [tl, tr, br, bl] = flip ? [e, f, g, h] : [a, b, c, d];
    return {
      borderTopLeftRadius: tl,
      borderTopRightRadius: tr,
      borderBottomRightRadius: br,
      borderBottomLeftRadius: bl,
    };
  }
  const [tl, tr, br, bl] = flip ? [6, 18, 5, 16] : [18, 6, 16, 5];
  const scale = small ? 0.6 : 1;
  return {
    borderTopLeftRadius: tl * scale,
    borderTopRightRadius: tr * scale,
    borderBottomRightRadius: br * scale,
    borderBottomLeftRadius: bl * scale,
  };
}

/** The hard, offset shadow of a pen-drawn box: 5px for cards, 3px for small buttons. */
export function offsetShadow(ink: string, size: 3 | 5 = 5): ViewStyle {
  return { boxShadow: `${size}px ${size}px 0px ${ink}` };
}

/** The hand-drawn underline under a screen title. */
export function Squiggle({ color, width = 190 }: { color: string; width?: number }) {
  return (
    <Svg width={width} height={14} viewBox="0 0 190 14" preserveAspectRatio="none" aria-hidden>
      <Path
        d="M2 8 C 22 1, 34 13, 56 7 S 96 2, 118 8 S 158 13, 188 4"
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A pencil-shaded tile, standing in for a missing picture: diagonal hatching or halftone dots. `seed`
 * (such as the item's id) picks the pattern, so neighbouring tiles differ.
 */
export function Hatch({ ink, bg, size, seed = 0 }: { ink: string; bg: string; size: number; seed?: number }) {
  // SVG ids may not contain the colons React puts in its ids.
  const id = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const kind = seed % 3;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, overflow: 'hidden', borderWidth: 3, borderColor: ink },
        sketchCorners(seed % 2 === 1, true),
      ]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={id}
            width={9}
            height={9}
            patternUnits="userSpaceOnUse"
            patternTransform={kind === 1 ? undefined : `rotate(${kind === 0 ? 45 : -45})`}>
            <Rect width={9} height={9} fill={bg} />
            {kind === 1 ? (
              <Circle cx={4.5} cy={4.5} r={1.7} fill={ink} />
            ) : (
              <Line x1={0} y1={0} x2={0} y2={9} stroke={ink} strokeWidth={3} />
            )}
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
