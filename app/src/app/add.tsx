import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { fetchLists } from '@/api/client';
import { errorMessage, isUnauthorized } from '@/api/errors';
import { firstLink } from '@/api/links';
import { useSharedLink } from '@/share/shared-link';
import { useAuth } from '@/auth/context';
import { rememberReturnTo } from '@/auth/storage';
import { Body, Message, Screen, Title } from '@/components/ui';

/**
 * /add?url=… (or ?text=…) opens a new item on the main list with that link, and reads the shop page.
 * It's where the phone's share sheet will land, and it works as a bookmark on the web too.
 */
export default function AddFromLinkScreen() {
  const { t, i18n } = useTranslation();
  const { status, token, forget } = useAuth();
  const params = useLocalSearchParams<{ url?: string; text?: string }>();
  // From the address (/add?url=…), or shared from another app's share sheet on Android.
  const shared = useSharedLink();
  const link = firstLink(params.url) ?? firstLink(params.text) ?? shared.link;
  const [error, setError] = useState<string | null>(link ? null : t('add.noLink'));

  useEffect(() => {
    if (!link) return;
    if (status === 'signedOut') {
      // Come back here after signing in.
      rememberReturnTo(`/add?url=${encodeURIComponent(link)}`);
      router.replace('/sign-in');
      return;
    }
    if (status !== 'signedIn' || !token) return;
    let active = true;
    fetchLists(token, i18n.language).then(
      (lists) => {
        const main = lists.find((list) => list.is_default);
        if (active && main) {
          router.replace({ pathname: '/lists/[id]/new', params: { id: String(main.id), url: link } });
          shared.done();
        }
      },
      (failure: unknown) => {
        if (!active) return;
        if (isUnauthorized(failure)) forget();
        else setError(errorMessage(failure, t));
      },
    );
    return () => {
      active = false;
    };
  }, [forget, i18n.language, link, shared, status, t, token]);

  return (
    <Screen>
      <Title>{t('add.title')}</Title>
      {error ? <Message tone="error">{error}</Message> : <ActivityIndicator />}
      {link && <Body muted>{link}</Body>}
    </Screen>
  );
}
