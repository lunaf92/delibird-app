import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { fetchSharedList, joinSharedList, type SharedList } from '@/api/client';
import { errorMessage, isUnauthorized } from '@/api/errors';
import { useAuth } from '@/auth/context';
import { rememberReturnTo } from '@/auth/storage';
import { SharedItemCard } from '@/components/shared-item';
import { Body, Button, Card, Message, Screen, Title } from '@/components/ui';

/** Where share links land. Anyone can read the list; nothing here says what is already taken. */
export default function SharedLinkScreen() {
  const { t, i18n } = useTranslation();
  const { status, token: session, forget } = useAuth();
  const { token = '' } = useLocalSearchParams<{ token: string }>();
  const [list, setList] = useState<SharedList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSharedList(session, token, i18n.language).then(
      (value) => active && setList(value),
      (failure: unknown) => {
        if (!active) return;
        if (isUnauthorized(failure)) forget();
        else setError(errorMessage(failure, t));
      },
    );
    return () => {
      active = false;
    };
  }, [forget, i18n.language, session, t, token]);

  const signIn = () => {
    rememberReturnTo(`/shared/${token}`);
    router.push('/sign-in');
  };

  const join = async () => {
    if (!session) return;
    setJoining(true);
    try {
      const joined = await joinSharedList(session, token, i18n.language);
      router.replace({ pathname: '/shared-with-me/[id]', params: { id: String(joined.id) } });
    } catch (failure) {
      setError(errorMessage(failure, t));
      setJoining(false);
    }
  };

  if (!list) {
    return <Screen>{error ? <Message tone="error">{error}</Message> : <ActivityIndicator />}</Screen>;
  }

  return (
    <Screen>
      <Title>{list.name}</Title>
      <Body muted>{t('shared.from', { name: list.owner_name })}</Body>

      <Card>
        {list.role === 'anonymous' && (
          <>
            <Body>{t('shared.signInToReserve', { owner: list.owner_name })}</Body>
            <Button label={t('shared.signIn')} onPress={signIn} />
          </>
        )}
        {list.role === 'invited' && status === 'signedIn' && (
          <>
            <Body>{t('shared.joinExplained')}</Body>
            <Button label={t('shared.join')} onPress={join} busy={joining} />
          </>
        )}
        {list.role === 'viewer' && (
          <Button
            label={t('shared.openInSharedWithMe')}
            onPress={() =>
              router.replace({ pathname: '/shared-with-me/[id]', params: { id: String(list.id) } })
            }
          />
        )}
        {list.role === 'owner' && <Body>{t('shared.ownerNote')}</Body>}
      </Card>
      <Message tone="error">{error}</Message>

      {list.items.length === 0 && <Body muted>{t('shared.empty')}</Body>}
      {list.items.map((item) => (
        <SharedItemCard key={item.id} item={item} />
      ))}
    </Screen>
  );
}
