import type { components } from '@/api/schema';

export type LookName = components['schemas']['ThemeEnum'];
export type DarkMode = components['schemas']['DarkModeEnum'];

/** How the app looks: kept on the account, and on the device before signing in. */
export type LookSettings = { theme: LookName; dark_mode: DarkMode; plain_font: boolean };

/** Four colours per look: the paper, the pen, the marker for the main action, and text on the marker. */
export type Palette = { bg: string; ink: string; accent: string; accentInk: string };

export const LOOK_NAMES: readonly LookName[] = ['ink', 'paper', 'chalk', 'sky', 'meadow'];

export const PALETTES: Record<LookName, Palette> = {
  ink: { bg: '#FFFFFF', ink: '#000000', accent: '#000000', accentInk: '#FFFFFF' },
  paper: { bg: '#F6F0E1', ink: '#1B1B1B', accent: '#B8321F', accentInk: '#FFF8EA' },
  chalk: { bg: '#121212', ink: '#F4F1EA', accent: '#FFD84D', accentInk: '#121212' },
  sky: { bg: '#EAF4FB', ink: '#0B2540', accent: '#1D6FB8', accentInk: '#FFFFFF' },
  meadow: { bg: '#EEF5E6', ink: '#11301A', accent: '#2E7D32', accentInk: '#FFFFFF' },
};

/** The dark look, used for "Always dark", and for "Follow my phone" when the phone is dark. */
export const DARK_LOOK: LookName = 'chalk';

export const DEFAULT_SETTINGS: LookSettings = { theme: 'ink', dark_mode: 'follow', plain_font: false };

export function isLookName(value: unknown): value is LookName {
  return typeof value === 'string' && (LOOK_NAMES as readonly string[]).includes(value);
}

export function isDarkMode(value: unknown): value is DarkMode {
  return value === 'follow' || value === 'light' || value === 'dark';
}

/** The look on screen: the chosen one, or the dark one when dark mode says so. */
export function activeLook(settings: LookSettings, phoneScheme: string | null | undefined): LookName {
  if (settings.dark_mode === 'dark') return DARK_LOOK;
  if (settings.dark_mode === 'follow' && phoneScheme === 'dark') return DARK_LOOK;
  return settings.theme;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two #RRGGBB colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
