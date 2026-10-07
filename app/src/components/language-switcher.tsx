import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SUPPORTED_LANGUAGES } from '@/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('home.language')}>
      {SUPPORTED_LANGUAGES.map((language) => {
        const selected = i18n.language === language;
        return (
          <Pressable
            key={language}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => i18n.changeLanguage(language)}
            style={[styles.option, selected && styles.selected]}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{t(`languages.${language}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: '#208AEF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  selected: { backgroundColor: '#208AEF' },
  label: { color: '#208AEF', fontSize: 15 },
  selectedLabel: { color: '#FFFFFF', fontWeight: '600' },
});
