import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/context';
import { Body, Button, Message, Screen, Title } from '@/components/ui';

/** Where the magic link in the sign-in email lands: /sign-in/verify?token=… */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(token ? null : t('signIn.linkInvalid'));
  const started = useRef(false);

  useEffect(() => {
    // A token works once, so never send it twice (for example when React re-runs effects in development).
    if (!token || started.current) return;
    started.current = true;
    signIn({ token }).catch((failure: unknown) => setError(errorMessage(failure, t)));
  }, [signIn, t, token]);

  return (
    <Screen>
      <Title>{t('signIn.verifyingTitle')}</Title>
      {error ? (
        <>
          <Message tone="error">{error}</Message>
          <Body>{t('signIn.linkHelp')}</Body>
          <Button label={t('signIn.backToSignIn')} onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </Screen>
  );
}
