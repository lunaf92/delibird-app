import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { deleteMe, endSession, fetchSessions, updateMe, type Session, type UserUpdate } from '@/api/client';
import { errorMessage, isUnauthorized } from '@/api/errors';
import { useSignedIn } from '@/auth/context';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ServerStatus } from '@/components/server-status';
import { Body, Button, Card, Heading, Message, Screen, TextField } from '@/components/ui';
import type { Language } from '@/i18n';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { token, user, setUser, signOut, forget } = useSignedIn();
  // null until edited, so the field shows the profile even when it arrives after the screen opens.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const displayName = nameDraft ?? user?.display_name ?? '';
  const [saving, setSaving] = useState<'name' | 'language' | null>(null);
  const [profileMessage, setProfileMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(
    null,
  );
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** Runs a request; a 401 means this session was ended elsewhere, so this device signs out too. */
  const guarded = useCallback(
    async <T,>(action: () => Promise<T>, onError: (message: string) => void): Promise<T | undefined> => {
      try {
        return await action();
      } catch (error) {
        if (isUnauthorized(error)) await forget();
        else onError(errorMessage(error, t));
        return undefined;
      }
    },
    [forget, t],
  );

  // Loads the signed-in devices, and again whenever one is signed out.
  useEffect(() => {
    let active = true;
    fetchSessions(token, i18n.language).then(
      (list) => {
        if (!active) return;
        setSessions(list);
        setSessionsError(null);
      },
      (error: unknown) => {
        if (!active) return;
        if (isUnauthorized(error)) forget();
        else setSessionsError(errorMessage(error, t));
      },
    );
    return () => {
      active = false;
    };
  }, [forget, i18n.language, sessionsVersion, t, token]);

  const saveProfile = async (changes: UserUpdate, field: 'name' | 'language') => {
    setSaving(field);
    setProfileMessage(null);
    const updated = await guarded(
      () => updateMe(token, changes, changes.language ?? i18n.language),
      (text) => setProfileMessage({ tone: 'error', text }),
    );
    setSaving(null);
    if (updated) {
      setUser(updated);
      setProfileMessage({ tone: 'success', text: t('settings.saved', { lng: updated.language }) });
    }
  };

  const changeLanguage = (language: Language) => {
    if (language !== i18n.language) saveProfile({ language }, 'language');
  };

  const signOutSession = async (id: number) => {
    setEndingSession(id);
    await guarded(() => endSession(token, id, i18n.language), setSessionsError);
    setEndingSession(null);
    setSessionsVersion((n) => n + 1);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMe(token, i18n.language);
      await forget();
    } catch (error) {
      if (isUnauthorized(error)) await forget();
      else {
        setDeleteError(errorMessage(error, t));
        setDeleting(false);
      }
    }
  };

  return (
    <Screen>
      <Heading>{t('settings.profile')}</Heading>
      {user && <Body muted>{t('settings.signedInAs', { email: user.email })}</Body>}
      <TextField
        label={t('settings.displayName')}
        value={displayName}
        onChangeText={setNameDraft}
        placeholder={t('settings.displayNamePlaceholder')}
        maxLength={100}
        autoComplete="name"
        textContentType="name"
      />
      <Button
        variant="secondary"
        label={t('settings.saveName')}
        onPress={() => saveProfile({ display_name: displayName.trim() }, 'name')}
        busy={saving === 'name'}
      />

      <Heading>{t('home.language')}</Heading>
      <LanguageSwitcher onChange={changeLanguage} disabled={saving !== null} />
      {profileMessage && <Message tone={profileMessage.tone}>{profileMessage.text}</Message>}

      <Heading>{t('settings.sessions')}</Heading>
      <Body muted>{t('settings.sessionsIntro')}</Body>
      <Message tone="error">{sessionsError}</Message>
      {sessions?.map((session) => (
        <Card key={session.id}>
          <Body>{session.device_name || t('settings.unknownDevice')}</Body>
          <Body muted>
            {session.current
              ? t('settings.thisDevice')
              : t('settings.lastUsed', {
                  date: new Date(session.last_used_at).toLocaleString(i18n.language),
                })}
          </Body>
          {!session.current && (
            <Button
              variant="link"
              label={t('settings.signOutSession')}
              onPress={() => signOutSession(session.id)}
              busy={endingSession === session.id}
            />
          )}
        </Card>
      ))}

      <Button
        variant="secondary"
        label={t('settings.signOut')}
        busy={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />

      <Heading>{t('settings.deleteTitle')}</Heading>
      {confirmingDelete ? (
        <Card>
          <Body>{t('settings.deleteWarning')}</Body>
          <Message tone="error">{deleteError}</Message>
          <View style={styles.row}>
            <Button
              variant="danger"
              label={t('settings.deleteConfirm')}
              onPress={deleteAccount}
              busy={deleting}
            />
            <Button
              variant="secondary"
              label={t('settings.cancel')}
              onPress={() => setConfirmingDelete(false)}
              disabled={deleting}
            />
          </View>
        </Card>
      ) : (
        <Button
          variant="link"
          label={t('settings.deleteAccount')}
          onPress={() => setConfirmingDelete(true)}
        />
      )}

      <ServerStatus />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
});
