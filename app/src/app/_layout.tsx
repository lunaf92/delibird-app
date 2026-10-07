import '@/i18n';

import { DarkTheme, DefaultTheme, router, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/context';
import { takeReturnTo } from '@/auth/storage';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

/** Signed-out people only reach the sign-in screens; everything in (app) needs a session. Share links
 * (/shared/…) open either way. */
function RootNavigator() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  // Keep the splash screen up until we know whether a saved session exists.
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  // After signing in, go back to where sign-in was asked for, such as a share link.
  useEffect(() => {
    if (!signedIn) return;
    const path = takeReturnTo();
    if (path?.startsWith('/') && !path.startsWith('//')) router.replace(path as never);
  }, [signedIn]);

  // Mounting the navigator only once the session is known keeps deep links (such as /settings) intact,
  // instead of redirecting them to sign-in while the saved session is still loading.
  if (status === 'loading') return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="shared/[token]" options={{ headerShown: true, title: t('appName') }} />
    </Stack>
  );
}
