import { screen } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

beforeEach(async () => {
  storeToken(null);
  await i18n.changeLanguage('en');
});

test('signed-out people land on sign-in', async () => {
  mockApi({});

  const app = await renderApp('/');

  expect(await screen.findByText('Welcome to Delibird')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
});

test('signed-out deep links to settings go to sign-in', async () => {
  mockApi({});

  const app = await renderApp('/settings');

  expect(await screen.findByText('Welcome to Delibird')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
});

test('a saved session opens the home screen', async () => {
  storeToken('saved-token');
  const calls = mockApi({ 'GET me/': { body: ANN } });

  const app = await renderApp('/');

  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/');
  expect(calls.find((call) => call.path === 'me/')?.headers.Authorization).toBe('Bearer saved-token');
});

test('an expired saved session is forgotten', async () => {
  storeToken('stale-token');
  mockApi({ 'GET me/': { status: 401, body: { detail: 'Your session has ended. Sign in again.' } } });

  const app = await renderApp('/');

  expect(await screen.findByText('Welcome to Delibird')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
});
