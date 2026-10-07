import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share as NativeShare, StyleSheet, View } from 'react-native';

import { createShare, fetchShares, stopSharing, type NewShare } from '@/api/client';
import { errorMessage } from '@/api/errors';
import { useApi, useResource } from '@/api/use-api';
import { Body, Button, Card, Heading, Message, Screen, TextField, Title } from '@/components/ui';

/** Who a list is shared with. Each person gets their own link, which can be stopped on its own. */
export default function SharingScreen() {
  const { t } = useTranslation();
  const api = useApi();
  const listId = Number(useLocalSearchParams<{ id: string }>().id);
  const {
    data: shares,
    error,
    reload,
  } = useResource(
    useCallback((token: string, language: string) => fetchShares(token, listId, language), [listId]),
  );
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewShare | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);

  const add = async () => {
    const address = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(address)) {
      setActionError(t('signIn.invalidEmail'));
      return;
    }
    setAdding(true);
    setActionError(null);
    try {
      const share = await api((token, language) => createShare(token, listId, address, language));
      setCreated(share);
      setCopied(false);
      setEmail('');
      reload();
    } catch (failure) {
      setActionError(errorMessage(failure, t));
    } finally {
      setAdding(false);
    }
  };

  const copy = async (link: string) => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
  };

  const stop = async (shareId: number) => {
    setActionError(null);
    try {
      await api((token, language) => stopSharing(token, shareId, language));
      setConfirming(null);
      reload();
    } catch (failure) {
      setActionError(errorMessage(failure, t));
    }
  };

  return (
    <Screen>
      <Title>{t('sharing.title')}</Title>
      <Body>{t('sharing.intro')}</Body>

      <Heading>{t('sharing.add')}</Heading>
      <TextField
        label={t('sharing.email')}
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={add}
        placeholder="name@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        inputMode="email"
      />
      <Button label={t('sharing.createLink')} onPress={add} busy={adding} disabled={!email.trim()} />
      <Message tone="error">{actionError}</Message>

      {created && (
        <Card>
          <Body>{t('sharing.linkFor', { email: created.email })}</Body>
          <Body muted>{created.link}</Body>
          <Body muted>{t('sharing.linkOnce')}</Body>
          <View style={styles.row}>
            <Button
              label={copied ? t('sharing.copied') : t('sharing.copy')}
              onPress={() => copy(created.link)}
            />
            {Platform.OS !== 'web' && (
              <Button
                variant="secondary"
                label={t('sharing.send')}
                onPress={() => NativeShare.share({ message: created.link })}
              />
            )}
          </View>
        </Card>
      )}

      <Heading>{t('sharing.people')}</Heading>
      <Message tone="error">{error}</Message>
      {shares?.length === 0 && <Body muted>{t('sharing.nobody')}</Body>}
      {shares?.map((share) => (
        <Card key={share.id}>
          <Body>{share.email}</Body>
          <Body muted>
            {share.joined ? t('sharing.joinedAs', { name: share.joined_as }) : t('sharing.notJoined')}
          </Body>
          {confirming === share.id ? (
            <>
              <Body>{t('sharing.stopWarning', { email: share.email })}</Body>
              <View style={styles.row}>
                <Button variant="danger" label={t('sharing.stopConfirm')} onPress={() => stop(share.id)} />
                <Button
                  variant="secondary"
                  label={t('settings.cancel')}
                  onPress={() => setConfirming(null)}
                />
              </View>
            </>
          ) : (
            <Button variant="link" label={t('sharing.stop')} onPress={() => setConfirming(share.id)} />
          )}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
});
