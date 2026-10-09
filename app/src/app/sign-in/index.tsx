import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { requestCode } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Body, Button, Heading, Message, Screen, TextField, Title } from '@/components/ui';

/** Step one: ask for the email address and send a code to it. New addresses get an account on first sign-in. */
export default function EmailScreen() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setError(t('signIn.invalidEmail'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestCode(address, i18n.language);
      router.push({ pathname: '/sign-in/code', params: { email: address } });
    } catch (failure) {
      setError(errorMessage(failure, t, t('signIn.invalidEmail')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('signIn.welcome')}</Title>
      <Body>{t('signIn.emailIntro')}</Body>
      <TextField
        label={t('signIn.email')}
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
        placeholder="name@example.com"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
        textContentType="emailAddress"
        returnKeyType="send"
      />
      <Message tone="error">{error}</Message>
      <Button label={t('signIn.sendCode')} onPress={submit} busy={busy} />

      <Heading>{t('home.language')}</Heading>
      <LanguageSwitcher />

      <Button variant="link" label={t('privacy.link')} onPress={() => router.push('/privacy')} />
    </Screen>
  );
}
