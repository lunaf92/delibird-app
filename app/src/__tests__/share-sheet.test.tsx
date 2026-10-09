import * as ShareIntent from 'expo-share-intent';
import { screen } from 'expo-router/testing-library';

import { redirectSystemPath } from '@/app/+native-intent';
import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const shareState = (ShareIntent as unknown as { __state: { shareIntent: unknown; ready: boolean } }).__state;

beforeEach(async () => {
  storeToken('my-token');
  shareState.shareIntent = null;
  shareState.ready = true;
  await i18n.changeLanguage('en');
});

test('a share from another app is sent to /add; other links open as usual', () => {
  expect(redirectSystemPath({ path: 'delibird://dataUrl=delibirdShareKey', initial: true })).toBe('/add');
  expect(redirectSystemPath({ path: '/shared/abc', initial: false })).toBe('/shared/abc');
});

test('a link shared from a shop app starts a new item from it', async () => {
  shareState.shareIntent = { text: 'Look at this scarf! https://shop.example.com/scarf', webUrl: null };
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
    'POST items/autofill/': {
      body: {
        found: true,
        url: 'https://shop.example.com/scarf',
        name: 'Wool scarf',
        description: '',
        price: '39.90',
        currency: 'EUR',
        image_url: null,
      },
    },
  });

  const app = await renderApp('/add');

  expect(
    await screen.findByText('Filled in from the shop. Check the details before saving.'),
  ).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/10/new');
  expect(screen.getByLabelText('Name').props.value).toBe('Wool scarf');
  expect(callsTo(calls, 'POST', 'items/autofill/')[0].body).toEqual({
    url: 'https://shop.example.com/scarf',
  });
  // Handled, so it isn't picked up again.
  expect(shareState.shareIntent).toBeNull();
});

test('a share arriving while the app shows something else still opens a new item', async () => {
  shareState.shareIntent = {
    text: 'https://shop.example.com/scarf',
    webUrl: 'https://shop.example.com/scarf',
  };
  mockApi({
    'GET me/': { body: ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
    'POST items/autofill/': {
      body: {
        found: true,
        url: 'https://shop.example.com/scarf',
        name: 'Wool scarf',
        description: '',
        price: null,
        currency: null,
        image_url: null,
      },
    },
  });

  const app = await renderApp('/');

  expect(
    await screen.findByText('Filled in from the shop. Check the details before saving.'),
  ).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/10/new');
});

test('a link shared without https:// still starts a new item', async () => {
  shareState.shareIntent = { text: 'Amazon.co.uk: Wool scarf amzn.eu/d/abc123', webUrl: null };
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
    'POST items/autofill/': {
      body: {
        found: false,
        url: 'https://amzn.eu/d/abc123',
        name: '',
        description: '',
        price: null,
        currency: null,
        image_url: null,
        problem: null,
      },
    },
  });

  await renderApp('/add');

  await screen.findByLabelText('Name');
  expect(callsTo(calls, 'POST', 'items/autofill/')[0].body).toEqual({ url: 'https://amzn.eu/d/abc123' });
});

test('while the share is still on its way, /add waits instead of saying there is no link', async () => {
  shareState.ready = false;
  mockApi({ 'GET me/': { body: ANN } });

  await renderApp('/add');

  expect(await screen.findByText('Add from a link')).toBeOnTheScreen();
  expect(screen.queryByText("There's no web link to add here.")).toBeNull();
});

test('a share without a link says so and shows what arrived', async () => {
  shareState.shareIntent = { text: 'Just some words', webUrl: null };
  mockApi({ 'GET me/': { body: ANN } });

  await renderApp('/add');

  expect(await screen.findByText("There's no web link to add here.")).toBeOnTheScreen();
  expect(screen.getByText('What was shared: Just some words')).toBeOnTheScreen();
});
