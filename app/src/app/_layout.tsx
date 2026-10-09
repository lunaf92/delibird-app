import '@/i18n';

import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { useFonts } from 'expo-font';
import {
  DarkTheme,
  DefaultTheme,
  router,
  SplashScreen,
  Stack,
  ThemeProvider,
  usePathname,
} from 'expo-router';
// The navigator expo-router checks before navigating; not exported publicly.
import { store } from 'expo-router/build/global-state/store';
import { useEffect, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/context';
import { takeReturnTo } from '@/auth/storage';
import { notificationPath } from '@/notifications/push';
import { SharedLinkProvider, useSharedLink } from '@/share/shared-link';
import { LookProvider, useLook } from '@/theme/context';
import * as Notifications from 'expo-notifications';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SharedLinkProvider>
      <AuthProvider>
        <LookProvider>
          <NavigationLook>
            <RootNavigator />
          </NavigationLook>
        </LookProvider>
      </AuthProvider>
    </SharedLinkProvider>
  );
}

/** Header bars and screen backgrounds follow the chosen look. */
function NavigationLook({ children }: PropsWithChildren) {
  const { colors, dark, fonts } = useLook();
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    dark,
    colors: {
      primary: colors.ink,
      background: colors.bg,
      card: colors.bg,
      text: colors.ink,
      border: colors.ink,
      notification: colors.accent,
    },
    fonts: fonts.heading
      ? { ...base.fonts, bold: { fontFamily: fonts.heading, fontWeight: '400' as const } }
      : base.fonts,
  };
  return <ThemeProvider value={theme}>{children}</ThemeProvider>;
}

/** Signed-out people only reach the sign-in screens; everything in (app) needs a session. Share links
 * (/shared/…) and the privacy policy (/privacy) open either way. */
function RootNavigator() {
  const { t } = useTranslation();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  // The handwriting fonts. If they fail to load, the system font is used instead.
  const [fontsLoaded, fontError] = useFonts({ PermanentMarker_400Regular, PatrickHand_400Regular });
  const ready = status !== 'loading' && (fontsLoaded || !!fontError);

  // Keep the splash screen up until we know whether a saved session exists, and the fonts are in.
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  // After signing in, go back to where sign-in was asked for, such as a share link.
  useEffect(() => {
    if (!signedIn || !ready) return;
    const path = takeReturnTo();
    if (path?.startsWith('/') && !path.startsWith('//')) {
      return whenNavigatorReady(() => router.replace(path as never));
    }
  }, [signedIn, ready]);

  // A link shared from another app's share sheet (Android) opens /add, which starts a new item from it.
  // This also covers shares arriving while the app is already open. A share often arrives while the app is
  // still starting, so it waits for the navigator.
  const shared = useSharedLink();
  const pathname = usePathname();
  useEffect(() => {
    if (shared.link && ready && pathname !== '/add') return whenNavigatorReady(() => router.push('/add'));
  }, [pathname, shared.link, ready]);

  // Mounting the navigator only once the session is known keeps deep links (such as /settings) intact,
  // instead of redirecting them to sign-in while the saved session is still loading.
  if (!ready) return null;

  return (
    <>
      {/* expo-notifications has no web implementation; on the web, notifications come by email. */}
      {Platform.OS !== 'web' && signedIn && <NotificationTaps />}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Screen name="shared/[token]" options={{ headerShown: true, title: t('appName') }} />
        <Stack.Screen name="add" options={{ headerShown: true, title: t('add.title') }} />
        <Stack.Screen name="privacy" options={{ headerShown: true, title: t('privacy.title') }} />
      </Stack>
    </>
  );
}

/**
 * Runs `go` as soon as expo-router can navigate: navigating earlier throws ("Attempted to navigate before
 * mounting the Root Layout") and closes the app. Its navigator becomes ready a few frames after the first
 * render, so this asks again each frame. The check is on expo-router's own navigator, the one it asserts
 * on; the container handed to the navigation queue can report ready sooner. Returns a way to cancel.
 */
function whenNavigatorReady(go: () => void): () => void {
  let frame = 0;
  const attempt = () => {
    if (store.navigationRef.isReady()) go();
    else frame = requestAnimationFrame(attempt);
  };
  attempt();
  return () => cancelAnimationFrame(frame);
}

/** Tapping a notification opens the list it is about. */
function NotificationTaps() {
  const tappedPath = notificationPath(Notifications.useLastNotificationResponse());
  useEffect(() => {
    if (tappedPath) router.push(tappedPath as never);
  }, [tappedPath]);
  return null;
}
