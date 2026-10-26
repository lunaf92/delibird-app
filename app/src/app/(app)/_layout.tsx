import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/context';
import { useSharedLink } from '@/share/shared-link';
import { GuideProvider } from '@/tour/guide';

// After signing in, the guard lands on the group's anchor: the lists.
export const unstable_settings = { anchor: 'index' };

export default function SignedInLayout() {
  const { t } = useTranslation();

  return (
    <GuideProvider>
      <FirstTour />
      <Stack screenOptions={{ title: t('appName'), headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="lists/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="lists/[id]/new" options={{ title: t('items.newTitle') }} />
        <Stack.Screen name="lists/[id]/sharing" options={{ title: t('sharing.title') }} />
        <Stack.Screen name="lists/[id]/add" options={{ title: t('lists.addExisting') }} />
        <Stack.Screen name="items/[id]" options={{ title: t('items.editTitle') }} />
        <Stack.Screen name="shared-with-me/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
        <Stack.Screen name="tour" options={{ headerShown: false }} />
      </Stack>
    </GuideProvider>
  );
}

/**
 * Opens the welcome tour for an account that has never seen it, once it lands on the home screen. Someone
 * signing in from a share link or a shared item goes there first; the tour waits for the next visit home.
 */
function FirstTour() {
  const { user } = useAuth();
  const pathname = usePathname();
  const shared = useSharedLink();
  const opened = useRef(false);
  const due = user?.tour_seen === false && pathname === '/' && !shared.link;
  useEffect(() => {
    if (!due || opened.current) return;
    opened.current = true;
    router.push('/tour');
  }, [due]);
  return null;
}
