import '@/i18n';

import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/context';

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

/** Signed-out people only reach the sign-in screens; everything in (app) needs a session. */
function RootNavigator() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  // Keep the splash screen up until we know whether a saved session exists.
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

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
    </Stack>
  );
}
