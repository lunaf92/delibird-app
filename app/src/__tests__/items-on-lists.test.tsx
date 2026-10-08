import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const CHRISTMAS = { ...DEFAULT_LIST, id: 11, name: 'Christmas', is_default: false, position: 1 };
const SCARF = item({ id: 101, lists: [10, 11], name: 'Wool scarf' });
const BOOK = item({ id: 102, lists: [10], name: 'Book' });
const BIKE = item({ id: 103, lists: [10], name: 'Bike' });

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

test('adding items you already have to a list', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, CHRISTMAS] },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [SCARF, BOOK, BIKE] } },
    'GET lists/11/': { body: { ...CHRISTMAS, items: [SCARF] } },
    'PUT lists/11/items/102/': { body: { ...BOOK, lists: [10, 11] } },
  });
  const app = await renderApp('/lists/11');

  await fireEvent.press(await screen.findByRole('button', { name: 'Add items you already have' }));

  expect(await screen.findByText('Add to Christmas')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/11/add');
  // Only items not on Christmas yet are offered.
  expect(screen.queryByRole('button', { name: 'Add Wool scarf' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Add Book' }));

  expect(await screen.findByText('Added')).toBeOnTheScreen();
  expect(callsTo(calls, 'PUT', 'lists/11/items/102/')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Add Bike' })).toBeOnTheScreen();
});

test('taking an item off a list that is not shared happens straight away', async () => {
  let items = [SCARF];
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/': () => ({ body: { ...CHRISTMAS, items } }),
    'DELETE lists/11/items/101/': () => {
      items = [];
      return { status: 204 };
    },
  });
  await renderApp('/lists/11');

  await fireEvent.press(await screen.findByRole('button', { name: 'Take Wool scarf off this list' }));

  await waitFor(() => expect(callsTo(calls, 'DELETE', 'lists/11/items/101/')).toHaveLength(1));
  expect(await screen.findByText("Nothing here yet. Add the first thing you'd like.")).toBeOnTheScreen();
});

test('taking an item off a shared list asks first', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/': { body: { ...CHRISTMAS, is_shared: true, items: [{ ...SCARF, on_shared_list: true }] } },
    'DELETE lists/11/items/101/': { status: 204 },
  });
  await renderApp('/lists/11');

  await fireEvent.press(await screen.findByRole('button', { name: 'Take Wool scarf off this list' }));

  expect(screen.getByText('Someone may already have bought this. Continue?')).toBeOnTheScreen();
  expect(callsTo(calls, 'DELETE', 'lists/11/items/101/')).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Take it off this list' }));
  await waitFor(() => expect(callsTo(calls, 'DELETE', 'lists/11/items/101/')).toHaveLength(1));
});

test('the default list holds everything, so it offers neither', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET lists/10/': { body: { ...DEFAULT_LIST, items: [SCARF, BOOK] } } });

  await renderApp('/lists/10');

  expect(await screen.findByText('Wool scarf')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /off this list/ })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add items you already have' })).not.toBeOnTheScreen();
});
