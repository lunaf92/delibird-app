import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet } from 'react-native';

import i18n from '@/i18n';
import { ANN, callsTo, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';
import { activeLook, contrastRatio, DEFAULT_SETTINGS, LOOK_NAMES, PALETTES } from '@/theme/looks';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  store.delete('delibird.look');
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

/** The colour the screen is painted in: the background of its scroll view. */
function screenBackground(): string {
  const screens = screen.getAllByTestId('screen');
  return StyleSheet.flatten(screens[screens.length - 1].props.style).backgroundColor as string;
}

async function openSettings(account: object = {}, handlers: Parameters<typeof mockApi>[0] = {}) {
  const me = { ...ANN, theme: 'ink', dark_mode: 'light', plain_font: false, ...account };
  const calls = mockApi({
    'GET me/': { body: me },
    'GET auth/sessions/': { body: [] },
    'PATCH me/': (body) => ({ body: { ...me, ...(body as object) } }),
    ...handlers,
  });
  await renderApp('/settings');
  await screen.findByText('Signed in as ann@example.com');
  return calls;
}

describe('the five looks', () => {
  test.each(LOOK_NAMES)('%s is readable: pen on paper and text on the marker', (name) => {
    const { bg, ink, accent, accentInk } = PALETTES[name];
    expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(accentInk, accent)).toBeGreaterThanOrEqual(4.5);
    // A chosen chip or the main button must stand out from the paper (WCAG's 3:1 for controls).
    expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(3);
  });

  test('placeholders, drawn in the pen colour at 70%, are still readable', () => {
    for (const name of LOOK_NAMES) {
      const { bg, ink } = PALETTES[name];
      const mix = (i: number) =>
        Math.round(0.7 * parseInt(ink.slice(i, i + 2), 16) + 0.3 * parseInt(bg.slice(i, i + 2), 16))
          .toString(16)
          .padStart(2, '0');
      expect(contrastRatio(`#${mix(1)}${mix(3)}${mix(5)}`, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('which look is on screen', () => {
  test('the chosen look, unless dark mode says otherwise', () => {
    expect(activeLook({ ...DEFAULT_SETTINGS, theme: 'sky', dark_mode: 'light' }, 'dark')).toBe('sky');
    expect(activeLook({ ...DEFAULT_SETTINGS, theme: 'sky', dark_mode: 'dark' }, 'light')).toBe('chalk');
    expect(activeLook({ ...DEFAULT_SETTINGS, theme: 'sky', dark_mode: 'follow' }, 'dark')).toBe('chalk');
    expect(activeLook({ ...DEFAULT_SETTINGS, theme: 'sky', dark_mode: 'follow' }, 'light')).toBe('sky');
    expect(activeLook({ ...DEFAULT_SETTINGS, theme: 'meadow', dark_mode: 'follow' }, null)).toBe('meadow');
  });
});

test("the account's look is used as soon as the profile arrives", async () => {
  await openSettings({ theme: 'sky' });

  await waitFor(() => expect(screenBackground()).toBe(PALETTES.sky.bg));
  expect(screen.getByRole('radio', { name: 'Light blue' })).toBeSelected();
});

test('picking a look shows it at once and saves it on the account', async () => {
  const calls = await openSettings();

  await fireEvent.press(screen.getByRole('radio', { name: 'Paper and red marker' }));

  await waitFor(() => expect(screenBackground()).toBe(PALETTES.paper.bg));
  expect(callsTo(calls, 'PATCH', 'me/')[0].body).toEqual({ theme: 'paper' });
  expect(screen.getByRole('radio', { name: 'Paper and red marker' })).toBeSelected();
  expect(screen.getByRole('radio', { name: 'Black ink' })).not.toBeSelected();
  // Remembered on this device too, for before the next sign-in.
  expect(JSON.parse(store.get('delibird.look')!)).toMatchObject({ theme: 'paper' });
});

test('always dark uses the chalkboard, whatever the look', async () => {
  const calls = await openSettings({ theme: 'meadow' });

  await fireEvent.press(screen.getByRole('radio', { name: 'Always dark' }));

  await waitFor(() => expect(screenBackground()).toBe(PALETTES.chalk.bg));
  expect(callsTo(calls, 'PATCH', 'me/')[0].body).toEqual({ dark_mode: 'dark' });
  // The chosen look is kept for when dark mode is off again.
  expect(screen.getByRole('radio', { name: 'Green' })).toBeSelected();
});

test('the plain font swaps the handwriting for the system font', async () => {
  const calls = await openSettings();
  const font = () =>
    StyleSheet.flatten(screen.getByText('Signed in as ann@example.com').props.style).fontFamily;
  expect(font()).toBe('PatrickHand_400Regular');

  await fireEvent.press(screen.getByRole('checkbox', { name: 'Use a plain, easy-to-read font' }));

  await waitFor(() => expect(font()).toBeUndefined());
  expect(callsTo(calls, 'PATCH', 'me/')[0].body).toEqual({ plain_font: true });
  expect(screen.getByRole('checkbox', { name: 'Use a plain, easy-to-read font' })).toBeChecked();
});

test('a look that could not be saved goes back, and says why', async () => {
  await openSettings(
    {},
    { 'PATCH me/': { status: 500, body: { detail: 'Something went wrong on the server.' } } },
  );

  await fireEvent.press(screen.getByRole('radio', { name: 'Chalkboard' }));

  await screen.findByText('Something went wrong on the server.');
  // Announced: it sits in an alert.
  expect(
    screen
      .getAllByRole('alert')
      .some((alert) => within(alert).queryByText('Something went wrong on the server.')),
  ).toBe(true);
  await waitFor(() => expect(screenBackground()).toBe(PALETTES.ink.bg));
  expect(screen.getByRole('radio', { name: 'Black ink' })).toBeSelected();
});

test('before signing in, the look this device last had is used', async () => {
  storeToken(null);
  store.set('delibird.look', JSON.stringify({ theme: 'paper', dark_mode: 'light', plain_font: false }));
  mockApi({});

  await renderApp('/sign-in');

  await waitFor(() => expect(screenBackground()).toBe(PALETTES.paper.bg));
});
