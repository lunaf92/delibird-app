import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { useLook } from '@/theme/context';
import { offsetShadow, sketchCorners, Squiggle } from '@/theme/sketch';

/** Text in the current look's handwriting (or the plain font), at a size that reads well in it. */
function useText(size: number, heading = false): TextStyle {
  const { colors, fonts } = useLook();
  const family = heading ? fonts.heading : fonts.body;
  return {
    color: colors.ink,
    fontFamily: family,
    fontSize: Math.round(size * fonts.scale),
    // The marker font has one weight; the plain font needs bold to stand out the same way.
    fontWeight: heading && !family ? '700' : '400',
  };
}

/** A scrollable screen body with the standard padding. */
export function Screen({ children }: PropsWithChildren) {
  const { colors } = useLook();
  return (
    <ScrollView
      testID="screen"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** A screen's title, underlined with a hand-drawn squiggle. */
export function Title({ children }: PropsWithChildren) {
  const { colors } = useLook();
  const text = useText(30, true);
  return (
    <View style={styles.titleBox}>
      <Text accessibilityRole="header" style={[text, styles.title]}>
        {children}
      </Text>
      <Squiggle color={colors.ink} width={170} />
    </View>
  );
}

export function Heading({ children }: PropsWithChildren) {
  const text = useText(20, true);
  return (
    <Text accessibilityRole="header" style={[text, styles.heading]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  const text = useText(16);
  return <Text style={[text, styles.body, muted && styles.muted]}>{children}</Text>;
}

/**
 * A status line, read out as soon as it appears. Errors are boxed with a "!" and confirmations get a tick,
 * so they differ by more than colour.
 */
export function Message({ children, tone }: PropsWithChildren<{ tone: 'error' | 'success' }>) {
  const { colors } = useLook();
  const text = useText(16);
  if (!children) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.message,
        { borderColor: colors.ink, borderStyle: tone === 'error' ? 'solid' : 'dashed' },
        sketchCorners(true, true),
      ]}>
      {/* A visual mark only: screen readers hear the message itself, announced as an alert. */}
      <Text
        style={[text, styles.body, styles.messageMark]}
        accessibilityElementsHidden
        importantForAccessibility="no">
        {tone === 'error' ? '!' : '✓'}
      </Text>
      <Text style={[text, styles.body, styles.grow]}>{children}</Text>
    </View>
  );
}

export function Card({ children, flip }: PropsWithChildren<{ flip?: boolean }>) {
  const { colors } = useLook();
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.ink, backgroundColor: colors.bg },
        sketchCorners(flip),
        offsetShadow(colors.ink, 5),
      ]}>
      {children}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  busy?: boolean;
  disabled?: boolean;
};

/**
 * Buttons drawn in pen. The main action is filled with the look's marker colour and written in marker;
 * the others are outlined, with a small offset shadow. Dangerous ones have a dashed outline.
 */
export function Button({ label, onPress, variant = 'primary', busy, disabled }: ButtonProps) {
  const { colors } = useLook();
  const inactive = disabled || busy;
  const primary = variant === 'primary';
  const textColor = primary ? colors.accentInk : colors.ink;
  const text = useText(primary ? 20 : 17, primary);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'link'
          ? styles.link
          : [
              styles.button,
              sketchCorners(primary),
              {
                borderColor: colors.ink,
                backgroundColor: primary ? colors.accent : colors.bg,
                borderStyle: variant === 'danger' ? 'dashed' : 'solid',
              },
              !primary && !pressed && offsetShadow(colors.ink, 3),
            ],
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[text, { color: textColor }, variant === 'link' && styles.underlined]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, style, ...props }: TextInputProps & { label: string }) {
  const { colors } = useLook();
  const labelText = useText(16);
  const inputText = useText(17);
  return (
    <View style={styles.field}>
      <Text style={labelText}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        // The pen colour, a little lighter: placeholders still need to be readable.
        placeholderTextColor={`${colors.ink}B3`}
        {...props}
        // Extra styles (such as a taller multi-line box) add to the field's look rather than replace it.
        style={[
          styles.input,
          inputText,
          { borderColor: colors.ink, backgroundColor: colors.bg },
          sketchCorners(true),
          style,
        ]}
      />
    </View>
  );
}

/** One choice in a radio group or a checkbox, drawn as a hand-inked box with a large tap area. */
export function Choice({
  label,
  selected,
  onPress,
  kind,
  disabled,
  children,
}: PropsWithChildren<{
  label: string;
  selected: boolean;
  onPress: () => void;
  kind: 'radio' | 'checkbox';
  disabled?: boolean;
}>) {
  const { colors } = useLook();
  const text = useText(17);
  return (
    <Pressable
      accessibilityRole={kind}
      accessibilityLabel={label}
      accessibilityState={kind === 'radio' ? { selected, disabled } : { checked: selected, disabled }}
      aria-checked={kind === 'checkbox' ? selected : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        sketchCorners(),
        // The chosen one has a thicker outline as well as its mark, so it never depends on colour.
        { borderColor: colors.ink, borderWidth: selected ? 5 : 3 },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <View
        style={[
          styles.mark,
          { borderColor: colors.ink, borderRadius: kind === 'radio' ? 14 : 4 },
          selected && { backgroundColor: colors.accent },
        ]}>
        {selected && <Text style={[styles.markText, { color: colors.accentInk }]}>✓</Text>}
      </View>
      {children}
      <Text style={[text, styles.grow]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A small pill in a row of choices, such as a currency or a language. The chosen one is filled with the
 * marker colour and has a thicker outline.
 */
export function Chip({
  label,
  selected,
  onPress,
  disabled,
  role = 'radio',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  role?: 'radio' | 'checkbox';
}) {
  const { colors } = useLook();
  const text = useText(16);
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'checkbox' ? { checked: selected, disabled } : { selected, disabled }}
      // react-native-web doesn't turn accessibilityState.checked into aria-checked, so set it directly.
      aria-checked={role === 'checkbox' ? selected : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        sketchCorners(selected),
        {
          borderColor: colors.ink,
          borderWidth: selected ? 5 : 3,
          backgroundColor: selected ? colors.accent : colors.bg,
        },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <Text style={[text, { color: selected ? colors.accentInk : colors.ink }]}>
        {role === 'checkbox' && selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  titleBox: { gap: 2 },
  title: { lineHeight: 42 },
  heading: { marginTop: 8 },
  body: { lineHeight: 24 },
  muted: { opacity: 0.8 },
  message: { borderWidth: 3, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', gap: 8 },
  messageMark: { fontWeight: '700' },
  card: { borderWidth: 3, padding: 14, gap: 8 },
  button: {
    minHeight: 48,
    borderWidth: 3,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { minHeight: 44, justifyContent: 'center' },
  underlined: { textDecorationLine: 'underline' },
  dimmed: { opacity: 0.6 },
  field: { gap: 6 },
  input: { borderWidth: 3, paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  choice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  mark: { width: 28, height: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 16, fontWeight: '700' },
  grow: { flex: 1 },
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
