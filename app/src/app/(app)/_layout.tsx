import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

// After signing in, the guard lands on the group's anchor: the home screen.
export const unstable_settings = { anchor: 'index' };

export default function SignedInLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={{ title: t('appName') }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
    </Stack>
  );
}
