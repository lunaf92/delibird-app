import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking } from 'react-native';

import { errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/context';
import { androidIntentUrl, canOpenAppFromBrowser } from '@/auth/open-in-app';
import { Body, Button, Message, Screen, Title } from '@/components/ui';

/** Where the magic link in the sign-in email lands: /sign-in/verify?token=… */
export default function VerifyScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { token, web } = useLocalSearchParams<{ token?: string; web?: string }>();
  // On an Android browser, offer the app first. `web=1` means the person chose the website (or the app isn't installed).
  const [handoff, setHandoff] = useState(() => Boolean(token) && !web && canOpenAppFromBrowser());
  const [error, setError] = useState<string | null>(token ? null : t('signIn.linkInvalid'));
  const started = useRef(false);

  useEffect(() => {
    // A token works once, so never send it twice (for example when React re-runs effects in development).
    if (!token || handoff || started.current) return;
    started.current = true;
    signIn({ token }).catch((failure: unknown) => setError(errorMessage(failure, t)));
  }, [handoff, signIn, t, token]);

  const intentUrl = androidIntentUrl(
    token ?? '',
    `/sign-in/verify?token=${encodeURIComponent(token ?? '')}&web=1`,
  );
  useEffect(() => {
    // Chrome may ignore this without a tap, so the button below does the same thing.
    if (handoff) Promise.resolve(Linking.openURL(intentUrl)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (handoff) {
    return (
      <Screen>
        <Title>{t('signIn.openAppTitle')}</Title>
        <Body>{t('signIn.openAppHelp')}</Body>
        <Button label={t('signIn.openApp')} onPress={() => Linking.openURL(intentUrl)} />
        <Button label={t('signIn.continueInBrowser')} onPress={() => setHandoff(false)} />
      </Screen>
    );
  }

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
