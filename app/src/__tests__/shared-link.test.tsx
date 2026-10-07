import { fireEvent, screen } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken, storedToken } from '@/test-utils/storage';

const SHARED = {
  id: 11,
  name: 'Christmas',
  owner_name: 'Ann',
  items: [item({ id: 101, name: 'Wool scarf', price: '39.90', url: 'https://shop.example.com/scarf' })],
};
const BOB = { id: 2, email: 'bob@example.com', display_name: 'Bob', language: 'en' as const };
const VIEWER_LIST = {
  id: 11,
  name: 'Christmas',
  owner_name: 'Ann',
  item_count: 1,
  items: [{ ...SHARED.items[0], reservation: { status: 'free', by: null } }],
};

beforeEach(async () => {
  storeToken(null);
  await i18n.changeLanguage('en');
});

test('a signed-out visitor sees the list but nothing about reservations', async () => {
  const calls = mockApi({ 'GET shared/abc/': { body: { ...SHARED, role: 'anonymous' } } });

  await renderApp('/shared/abc');

  expect(await screen.findByText('Wool scarf')).toBeOnTheScreen();
  expect(screen.getByText('From Ann')).toBeOnTheScreen();
  expect(screen.getByText('€39.90')).toBeOnTheScreen();
  expect(screen.queryByText(/is getting this/)).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: "I'll get this" })).not.toBeOnTheScreen();
  expect(callsTo(calls, 'GET', 'shared/abc/')[0].headers.Authorization).toBeUndefined();
});

test('signing in from a share link comes back to it, then joining opens the list', async () => {
  mockApi({
    'GET shared/abc/': { status: 200, body: { ...SHARED, role: 'anonymous' } },
    'POST auth/request-code/': { status: 202, body: { detail: 'Sent.' } },
    'POST auth/verify/': { body: { token: 'bob-token', user: BOB } },
  });
  const app = await renderApp('/shared/abc');
  await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));

  await fireEvent.changeText(await screen.findByLabelText('Email'), 'bob@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
  await fireEvent.changeText(await screen.findByLabelText('Code'), '123456');
  mockApi({
    'GET shared/abc/': { body: { ...SHARED, role: 'invited' } },
    'POST auth/verify/': { body: { token: 'bob-token', user: BOB } },
    'POST shared/abc/join/': { body: { id: 11, name: 'Christmas', owner_name: 'Ann', item_count: 1 } },
    'GET shared-with-me/11/': { body: VIEWER_LIST },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('button', { name: 'Add to Shared with me' })).toBeOnTheScreen();
  expect(app.pathname()).toBe('/shared/abc');
  expect(storedToken()).toBe('bob-token');

  await fireEvent.press(screen.getByRole('button', { name: 'Add to Shared with me' }));
  expect(await screen.findByRole('button', { name: "I'll get this" })).toBeOnTheScreen();
  expect(app.pathname()).toBe('/shared-with-me/11');
});

test('the owner opening their own link sees the owner note', async () => {
  storeToken('ann-token');
  mockApi({ 'GET me/': { body: ANN }, 'GET shared/abc/': { body: { ...SHARED, role: 'owner' } } });

  await renderApp('/shared/abc');

  expect(await screen.findByText(/This is your list/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add to Shared with me' })).not.toBeOnTheScreen();
});

test('a link that stopped working says so', async () => {
  mockApi({
    'GET shared/old/': {
      status: 404,
      body: { detail: "This link doesn't work any more. Ask for a new one." },
    },
  });

  await renderApp('/shared/old');

  expect(await screen.findByText("This link doesn't work any more. Ask for a new one.")).toBeOnTheScreen();
});
