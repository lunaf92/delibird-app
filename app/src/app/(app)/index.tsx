import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { API_URL, fetchHealth, type Health } from '@/api/client';
import { useAuth } from '@/auth/context';
import { Body, Button, Card, Heading, Message, Screen, Title } from '@/components/ui';

type Result = { key: string; health: Health } | { key: string; failed: true };

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
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
  const name = user?.display_name || user?.email;

  return (
    <Screen>
      <Title>{name ? t('home.greeting', { name }) : t('home.greetingNoName')}</Title>
      <Body>{t('home.title')}</Body>

      <Card>
        <Heading>{t('home.server')}</Heading>
        {current === null && (
          <View style={styles.row}>
            <ActivityIndicator />
            <Body>{t('home.checking')}</Body>
          </View>
        )}
        {current && 'health' in current && (
          <Message tone={current.health.status === 'ok' ? 'success' : 'error'}>
            {current.health.message}
          </Message>
        )}
        {current && 'failed' in current && (
          <>
            <Message tone="error">{t('home.unreachable', { url: API_URL })}</Message>
            <Button variant="link" label={t('home.retry')} onPress={() => setAttempt((n) => n + 1)} />
          </>
        )}
      </Card>

      <Button variant="secondary" label={t('settings.title')} onPress={() => router.push('/settings')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
