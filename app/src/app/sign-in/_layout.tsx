import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

// Signing out lands on the group's anchor: the email screen.
export const unstable_settings = { anchor: 'index' };

export default function SignInLayout() {
  const { t } = useTranslation();

  return (
    <Stack screenOptions={{ title: t('signIn.title') }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="code" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
