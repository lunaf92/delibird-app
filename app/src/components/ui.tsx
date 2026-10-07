import { useTheme } from 'expo-router';
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
} from 'react-native';

export const BLUE = '#208AEF';
export const RED = '#C4314B';
export const GREEN = '#1B873F';

/** A scrollable screen body with the standard padding. */
export function Screen({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Title({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  const { colors } = useTheme();
  return <Text style={[styles.body, { color: colors.text }, muted && styles.muted]}>{children}</Text>;
}

/** A status line: errors in red, confirmations in green. */
export function Message({ children, tone }: PropsWithChildren<{ tone: 'error' | 'success' }>) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={[styles.body, { color: tone === 'error' ? RED : GREEN }]}>
      {children}
    </Text>
  );
}

export function Card({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return <View style={[styles.card, { borderColor: colors.border }]}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  busy?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', busy, disabled }: ButtonProps) {
  const inactive = disabled || busy;
  const filled = variant === 'primary' || variant === 'danger';
  const color = variant === 'danger' ? RED : BLUE;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'link' ? styles.link : styles.button,
        filled && { backgroundColor: color },
        variant === 'secondary' && { borderColor: color, borderWidth: 1 },
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={filled ? '#FFFFFF' : color} />
      ) : (
        <Text style={[styles.buttonLabel, { color: filled ? '#FFFFFF' : color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8A8F98"
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 24, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  heading: { fontSize: 17, fontWeight: '600', marginTop: 8 },
  body: { fontSize: 15, lineHeight: 21 },
  muted: { opacity: 0.7 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  button: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { minHeight: 32, justifyContent: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  dimmed: { opacity: 0.6 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
