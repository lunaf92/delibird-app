import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { SUPPORTED_LANGUAGES, type Language } from '@/i18n';

import { Chip } from './ui';

type Props = {
  /** Called instead of switching the app's language directly, for example to save the choice first. */
  onChange?: (language: Language) => void;
  disabled?: boolean;
};

export function LanguageSwitcher({ onChange, disabled }: Props) {
  const { t, i18n } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('home.language')}>
      {SUPPORTED_LANGUAGES.map((language) => (
        <Chip
          key={language}
          label={t(`languages.${language}`)}
          selected={i18n.language === language}
          disabled={disabled}
          onPress={() => (onChange ? onChange(language) : i18n.changeLanguage(language))}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
