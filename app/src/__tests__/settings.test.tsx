import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken, storedToken } from '@/test-utils/storage';

const LAPTOP = {
  id: 1,
  device_name: 'Laptop',
  created_at: '2026-10-01T10:00:00Z',
  last_used_at: '2026-10-07T10:00:00Z',
  current: true,
};
const PHONE = { ...LAPTOP, id: 2, device_name: 'Pixel 9', current: false };

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

async function openSettings(handlers: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET auth/sessions/': { body: [LAPTOP, PHONE] },
    ...handlers,
  });
  const app = await renderApp('/settings');
  await screen.findByText('Signed in as ann@example.com');
  return { calls, app };
}

test('lists signed-in devices and marks this one', async () => {
  await openSettings();

  expect(await screen.findByText('Pixel 9')).toBeOnTheScreen();
  expect(screen.getByText('Laptop')).toBeOnTheScreen();
  expect(screen.getByText('This device')).toBeOnTheScreen();
  // Only other devices get their own sign-out button.
  expect(screen.getAllByRole('button', { name: 'Sign out this device' })).toHaveLength(1);
});

test('signing out another device', async () => {
  let sessions = [LAPTOP, PHONE];
  const { calls } = await openSettings({
    'GET auth/sessions/': () => ({ body: sessions }),
    'DELETE auth/sessions/2/': () => {
      sessions = [LAPTOP];
      return { status: 204 };
    },
  });
  await screen.findByText('Pixel 9');

  await fireEvent.press(screen.getByRole('button', { name: 'Sign out this device' }));

  await waitFor(() => expect(screen.queryByText('Pixel 9')).not.toBeOnTheScreen());
  expect(callsTo(calls, 'DELETE', 'auth/sessions/2/')[0].headers.Authorization).toBe('Bearer my-token');
});

test('saving the display name', async () => {
  const { calls } = await openSettings({
    'PATCH me/': (body) => ({ body: { ...ANN, ...(body as object) } }),
  });

  await fireEvent.changeText(screen.getByLabelText('Display name'), '  Annie  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save name' }));

  expect(await screen.findByText('Saved.')).toBeOnTheScreen();
  expect(callsTo(calls, 'PATCH', 'me/')[0].body).toEqual({ display_name: 'Annie' });
});

test('changing the language saves it and translates the app', async () => {
  const { calls } = await openSettings({
    'PATCH me/': (body) => ({ body: { ...ANN, ...(body as object) } }),
  });

  await fireEvent.press(screen.getByRole('radio', { name: 'Italiano' }));

  expect(await screen.findByText('Salvato.')).toBeOnTheScreen();
  expect(screen.getByText('Dispositivi connessi')).toBeOnTheScreen();
  expect(callsTo(calls, 'PATCH', 'me/')[0].body).toEqual({ language: 'it' });
  expect(i18n.language).toBe('it');
});

test('signing out ends the session and returns to sign-in', async () => {
  const { calls, app } = await openSettings({ 'POST auth/logout/': { status: 204 } });

  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
  expect(callsTo(calls, 'POST', 'auth/logout/')).toHaveLength(1);
  expect(storedToken()).toBeUndefined();
});

test('deleting the account needs a confirmation', async () => {
  const { calls, app } = await openSettings({ 'DELETE me/': { status: 204 } });

  await fireEvent.press(screen.getByRole('button', { name: 'Delete my account…' }));
  expect(screen.getByText(/permanently deletes your account/)).toBeOnTheScreen();
  expect(callsTo(calls, 'DELETE', 'me/')).toHaveLength(0);

  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText(/permanently deletes your account/)).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Delete my account…' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Delete permanently' }));

  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
  expect(callsTo(calls, 'DELETE', 'me/')).toHaveLength(1);
  expect(storedToken()).toBeUndefined();
});

test('a session ended elsewhere signs this device out', async () => {
  mockApi({
    'GET me/': { body: ANN },
    'GET auth/sessions/': { status: 401, body: { detail: 'Your session has ended. Sign in again.' } },
  });

  const app = await renderApp('/settings');

  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
  expect(storedToken()).toBeUndefined();
});
