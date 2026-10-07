import { useTheme } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { API_URL, fetchHealth, type Health } from '@/api/client';
import { LanguageSwitcher } from '@/components/language-switcher';

type Result = { key: string; health: Health } | { key: string; failed: true };

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const language = i18n.language;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  // Ask again whenever the language changes or the user retries.
  const requestKey = `${language}:${attempt}`;
  useEffect(() => {
    let active = true;
    fetchHealth(language).then(
      (health) => active && setResult({ key: requestKey, health }),
      () => active && setResult({ key: requestKey, failed: true }),
    );
    return () => {
      active = false;
    };
  }, [language, requestKey]);

  const current = result?.key === requestKey ? result : null;
  const retry = () => setAttempt((n) => n + 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('home.title')}</Text>

      <View style={[styles.card, { borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.server')}</Text>
        {current === null && (
          <View style={styles.row}>
            <ActivityIndicator />
            <Text style={{ color: colors.text }}>{t('home.checking')}</Text>
          </View>
        )}
        {current && 'health' in current && (
          <Text style={{ color: current.health.status === 'ok' ? '#1B873F' : '#C4314B' }}>
            {current.health.message}
          </Text>
        )}
        {current && 'failed' in current && (
          <>
            <Text style={{ color: '#C4314B' }}>{t('home.unreachable', { url: API_URL })}</Text>
            <Pressable accessibilityRole="button" onPress={retry}>
              <Text style={styles.link}>{t('home.retry')}</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={[styles.cardTitle, { color: colors.text }]}>{t('home.language')}</Text>
      <LanguageSwitcher />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { color: '#208AEF', fontWeight: '600' },
});
