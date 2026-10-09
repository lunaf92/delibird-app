import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { updateMe } from '@/api/client';
import { useAuth } from '@/auth/context';

import {
  activeLook,
  DEFAULT_SETTINGS,
  isDarkMode,
  isLookName,
  PALETTES,
  type LookName,
  type LookSettings,
  type Palette,
} from './looks';
import { loadLook, saveLook } from './storage';

/** The handwriting fonts, loaded in the root layout. */
export const MARKER_FONT = 'PermanentMarker_400Regular';
export const HAND_FONT = 'PatrickHand_400Regular';

type Fonts = {
  /** Screen titles and main buttons: a marker pen, or the system font in bold. */
  heading: string | undefined;
  /** Everything else: handwriting, or the system font. */
  body: string | undefined;
  /** Handwriting reads small, so its text is drawn a little larger. */
  scale: number;
};

type LookValue = {
  /** The look on screen right now. */
  name: LookName;
  colors: Palette;
  dark: boolean;
  fonts: Fonts;
  settings: LookSettings;
  /** Applies a change straight away and saves it: on the account when signed in, else on this device. */
  changeLook: (changes: Partial<LookSettings>) => Promise<void>;
};

const LookContext = createContext<LookValue | null>(null);

/** The default look, for parts drawn outside the app's provider, such as a component on its own in a test. */
const STANDALONE: LookValue = {
  name: DEFAULT_SETTINGS.theme,
  colors: PALETTES[DEFAULT_SETTINGS.theme],
  dark: false,
  fonts: { heading: MARKER_FONT, body: HAND_FONT, scale: 1.2 },
  settings: DEFAULT_SETTINGS,
  changeLook: async () => undefined,
};

export function useLook(): LookValue {
  return use(LookContext) ?? STANDALONE;
}

export function LookProvider({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const auth = useAuth();
  const phoneScheme = useColorScheme();
  // What this device last had: used before the profile arrives, and when signed out.
  const [deviceSettings, setDeviceSettings] = useState<LookSettings>(DEFAULT_SETTINGS);
  // A change on its way to the account, shown straight away.
  const [pending, setPending] = useState<LookSettings | null>(null);

  useEffect(() => {
    let active = true;
    loadLook().then((saved) => active && setDeviceSettings(saved));
    return () => {
      active = false;
    };
  }, []);

  // Once signed in, the account's look wins, and is remembered here for the next start.
  const user = auth.status === 'signedIn' ? auth.user : null;
  const accountSettings = useMemo<LookSettings | null>(
    () =>
      user
        ? {
            // An older server may not send these yet: then the defaults apply.
            theme: isLookName(user.theme) ? user.theme : DEFAULT_SETTINGS.theme,
            dark_mode: isDarkMode(user.dark_mode) ? user.dark_mode : DEFAULT_SETTINGS.dark_mode,
            plain_font: user.plain_font === true,
          }
        : null,
    [user],
  );
  useEffect(() => {
    if (accountSettings) saveLook(accountSettings);
  }, [accountSettings]);

  const settings = pending ?? accountSettings ?? deviceSettings;
  // The latest settings, so quick changes in a row build on each other.
  const latest = useRef(settings);
  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  const { token, setUser } = auth;
  const changeLook = useCallback(
    async (changes: Partial<LookSettings>) => {
      const next = { ...latest.current, ...changes };
      latest.current = next;
      await saveLook(next);
      if (!token) {
        setDeviceSettings(next);
        return;
      }
      setPending(next);
      try {
        setUser(await updateMe(token, changes, i18n.language));
      } catch (error) {
        // Not saved: the account's look comes back, here and in this device's copy.
        latest.current = accountSettings ?? deviceSettings;
        await saveLook(latest.current);
        throw error;
      } finally {
        setPending(null);
      }
    },
    [accountSettings, deviceSettings, i18n, setUser, token],
  );

  const value = useMemo<LookValue>(() => {
    const name = activeLook(settings, phoneScheme);
    const plain = settings.plain_font;
    return {
      name,
      colors: PALETTES[name],
      dark: name === 'chalk',
      fonts: {
        heading: plain ? undefined : MARKER_FONT,
        body: plain ? undefined : HAND_FONT,
        scale: plain ? 1 : 1.2,
      },
      settings,
      changeLook,
    };
  }, [changeLook, phoneScheme, settings]);

  return <LookContext value={value}>{children}</LookContext>;
}
