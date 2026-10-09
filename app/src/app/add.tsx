import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { fetchLists } from '@/api/client';
import { errorMessage, isUnauthorized } from '@/api/errors';
import { firstLink } from '@/api/links';
import { askForShare, useSharedLink } from '@/share/shared-link';
import { useAuth } from '@/auth/context';
import { rememberReturnTo } from '@/auth/storage';
import { Body, Message, Screen, Title } from '@/components/ui';

/**
 * /add?url=… (or ?text=…) opens a new item on the main list with that link, and reads the shop page.
 * It's where the phone's share sheet will land, and it works as a bookmark on the web too.
 */
/** How long /add waits for a share to arrive before saying there's no link in it. */
export const SHARE_GRACE_MS = 3000;

export default function AddFromLinkScreen() {
  const { t, i18n } = useTranslation();
  const { status, token, forget } = useAuth();
  const params = useLocalSearchParams<{ url?: string; text?: string }>();
  // From the address (/add?url=…), or shared from another app's share sheet on Android.
  const shared = useSharedLink();
  const link = firstLink(params.url) ?? firstLink(params.text) ?? shared.link;
  const [error, setError] = useState<string | null>(null);
  // A share reaches the app a moment after it opens (on Android it may even restart in its own task), so give
  // it a little time before saying there is no link.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), SHARE_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  const noLink = !link && waited;
  // A share can be waiting in the app without having reached this screen yet (see askForShare).
  useEffect(() => {
    if (link) return;
    askForShare();
    const timer = setInterval(askForShare, 250);
    return () => clearInterval(timer);
  }, [link]);

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
      {noLink || error ? (
        <Message tone="error">{noLink ? t('add.noLink') : error}</Message>
      ) : (
        <ActivityIndicator />
      )}
      {link && <Body muted>{link}</Body>}
      {/* What the other app shared, so it's clear why no link was found in it. */}
      {noLink && shared.text && <Body muted>{t('add.received', { text: shared.text })}</Body>}
    </Screen>
  );
}
