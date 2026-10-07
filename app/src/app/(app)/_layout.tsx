import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

// After signing in, the guard lands on the group's anchor: the lists.
export const unstable_settings = { anchor: 'index' };

export default function SignedInLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={{ title: t('appName'), headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="lists/[id]/index" options={{ title: '' }} />
      <Stack.Screen name="lists/[id]/new" options={{ title: t('items.newTitle') }} />
      <Stack.Screen name="lists/[id]/sharing" options={{ title: t('sharing.title') }} />
      <Stack.Screen name="items/[id]" options={{ title: t('items.editTitle') }} />
      <Stack.Screen name="shared-with-me/[id]" options={{ title: '' }} />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
    </Stack>
  );
}
