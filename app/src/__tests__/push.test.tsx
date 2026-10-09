import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';

import i18n from '@/i18n';
import { pushAvailability } from '@/notifications/push';
import { ANN, callsTo, mockApi } from '@/test-utils/api';
import { notificationsMock, tappedNotification } from '@/test-utils/notifications';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

jest.mock('@/notifications/push', () => ({
  ...jest.requireActual('@/notifications/push'),
  pushAvailability: jest.fn(() => 'available'),
}));
const availability = pushAvailability as jest.Mock;

const VIEWER_LIST = { id: 11, name: 'Christmas', owner_name: 'Bob', item_count: 0, items: [] };

beforeEach(async () => {
  storeToken('my-token');
  await SecureStore.deleteItemAsync('strena.pushToken');
  availability.mockReturnValue('available');
  notificationsMock.permission = 'granted';
  tappedNotification(null);
  await i18n.changeLanguage('en');
});

function openSettings(handlers: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ 'GET me/': { body: ANN }, 'GET auth/sessions/': { body: [] }, ...handlers });
  return { calls, ready: renderApp('/settings').then(() => screen.findByText('Notifications')) };
}

test('turning on notifications registers this phone', async () => {
  const { calls, ready } = openSettings({ 'POST devices/': { status: 204 } });
  await ready;

  await fireEvent.press(screen.getByRole('button', { name: 'Also notify this phone' }));

  expect(await screen.findByText('This phone gets notifications too.')).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'devices/')[0].body).toEqual({
    token: 'ExponentPushToken[test-phone]',
    platform: 'ios',
  });
});

test('a refused permission is explained and nothing is registered', async () => {
  notificationsMock.permission = 'denied';
  const { calls, ready } = openSettings();
  await ready;

  await fireEvent.press(screen.getByRole('button', { name: 'Also notify this phone' }));

  expect(
    await screen.findByText("Notifications are turned off for Strena in this phone's settings."),
  ).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'devices/')).toHaveLength(0);
});

test('builds without push say so instead of offering it', async () => {
  availability.mockReturnValue('not-configured');
  const { ready } = openSettings();
  await ready;

  expect(
    screen.getByText("Phone notifications aren't set up in this build of the app yet."),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Also notify this phone' })).not.toBeOnTheScreen();
});

test('signing out stops notifications to this phone', async () => {
  await SecureStore.setItemAsync('strena.pushToken', 'ExponentPushToken[test-phone]');
  const { calls, ready } = openSettings({
    'DELETE devices/': { status: 204 },
    'POST auth/logout/': { status: 204 },
  });
  await ready;
  expect(await screen.findByText('This phone gets notifications too.')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

  await screen.findByText('Welcome to Strena');
  expect(callsTo(calls, 'DELETE', 'devices/')[0].body).toEqual({ token: 'ExponentPushToken[test-phone]' });
  expect(calls.findIndex((c) => c.path === 'devices/')).toBeLessThan(
    calls.findIndex((c) => c.path === 'auth/logout/'),
  );
});

test('tapping a notification opens the list it is about', async () => {
  tappedNotification('/shared-with-me/11');
  mockApi({ 'GET me/': { body: ANN }, 'GET shared-with-me/11/': { body: VIEWER_LIST } });

  const app = await renderApp('/');

  await waitFor(() => expect(app.pathname()).toBe('/shared-with-me/11'));
});

test('notification paths that leave the app are ignored', async () => {
  tappedNotification('//evil.example.com');
  mockApi({ 'GET me/': { body: ANN } });

  const app = await renderApp('/');

  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/');
});
