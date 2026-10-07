import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { requestCode } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/context';
import { Body, Button, Message, Screen, TextField, Title } from '@/components/ui';

/** Step two: type the six-digit code from the email. The magic link in the same email skips this screen. */
export default function CodeScreen() {
  const { t, i18n } = useTranslation();
  const { signIn } = useAuth();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError(t('signIn.codeFormat'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // Once signed in, the navigator's guard moves on to the home screen.
      await signIn({ email, code });
    } catch (failure) {
      setError(errorMessage(failure, t));
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await requestCode(email, i18n.language);
      setCode('');
      setNotice(t('signIn.codeResent'));
    } catch (failure) {
      setError(errorMessage(failure, t));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <Title>{t('signIn.checkEmail')}</Title>
      <Body>{t('signIn.codeIntro', { email })}</Body>
      <TextField
        label={t('signIn.code')}
        value={code}
        onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
        onSubmitEditing={submit}
        placeholder="123456"
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        returnKeyType="done"
        autoFocus
      />
      <Message tone="error">{error}</Message>
      <Message tone="success">{notice}</Message>
      <Button label={t('signIn.signIn')} onPress={submit} busy={busy} />
      <Button variant="link" label={t('signIn.resend')} onPress={resend} busy={resending} />
      <Button variant="link" label={t('signIn.differentEmail')} onPress={() => router.back()} />
    </Screen>
  );
}
