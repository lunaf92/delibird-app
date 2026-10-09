import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { useLook } from '@/theme/context';
import { LOOK_NAMES, PALETTES, type DarkMode, type LookName, type LookSettings } from '@/theme/looks';

import { Body, Choice, Heading, Message } from './ui';

const DARK_MODES: readonly DarkMode[] = ['follow', 'light', 'dark'];

/** Pick a look, dark mode and the plain font. Changes show at once and are saved on the account. */
export function LookSettingsSection() {
  const { t } = useTranslation();
  const { settings, changeLook } = useLook();
  const [error, setError] = useState<string | null>(null);

  const change = (changes: Partial<LookSettings>) => {
    setError(null);
    changeLook(changes).catch((failure: unknown) => setError(errorMessage(failure, t)));
  };

  return (
    <>
      <Heading>{t('look.title')}</Heading>
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('look.title')}>
        {LOOK_NAMES.map((name) => (
          <Choice
            key={name}
            kind="radio"
            label={t(`look.names.${name}`)}
            selected={settings.theme === name}
            onPress={() => change({ theme: name })}>
            <Swatch name={name} />
          </Choice>
        ))}
      </View>

      <Heading>{t('look.darkMode')}</Heading>
      <Body muted>{t('look.darkExplained')}</Body>
      <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t('look.darkMode')}>
        {DARK_MODES.map((mode) => (
          <Choice
            key={mode}
            kind="radio"
            label={t(`look.darkModes.${mode}`)}
            selected={settings.dark_mode === mode}
            onPress={() => change({ dark_mode: mode })}
          />
        ))}
      </View>

      <Choice
        kind="checkbox"
        label={t('look.plainFont')}
        selected={settings.plain_font}
        onPress={() => change({ plain_font: !settings.plain_font })}
      />
      <Message tone="error">{error}</Message>
    </>
  );
}

/** A small sample of a look: its paper, pen and marker. */
function Swatch({ name }: { name: LookName }) {
  const palette = PALETTES[name];
  return (
    <View style={[styles.swatch, { backgroundColor: palette.bg, borderColor: palette.ink }]}>
      <View style={[styles.dot, { backgroundColor: palette.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
