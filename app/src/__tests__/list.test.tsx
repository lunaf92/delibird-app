import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const CHRISTMAS = { ...DEFAULT_LIST, id: 11, name: 'Christmas', is_default: false, position: 1 };
const SCARF = item({ id: 101, wishlist: 11, name: 'Wool scarf', price: '39.90', currency: 'EUR', rating: 4 });
const BOOK = item({ id: 102, wishlist: 11, name: 'Book', position: 1 });

function christmasWith(items: unknown[]) {
  return { body: { ...CHRISTMAS, item_count: items.length, items } };
}

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

test('shows items with price and rating', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET lists/11/': christmasWith([SCARF, BOOK]) });

  await renderApp('/lists/11');

  expect(await screen.findByText('Wool scarf')).toBeOnTheScreen();
  expect(screen.getByText('€39.90')).toBeOnTheScreen();
  expect(screen.getByLabelText('4 stars')).toBeOnTheScreen();
  expect(screen.getByText('Book')).toBeOnTheScreen();
});

test('moving an item saves the new order', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/': christmasWith([SCARF, BOOK]),
    'POST lists/11/items/reorder/': { status: 204 },
  });
  await renderApp('/lists/11');

  await fireEvent.press(await screen.findByRole('button', { name: 'Move Book up' }));

  await waitFor(() => expect(callsTo(calls, 'POST', 'lists/11/items/reorder/')).toHaveLength(1));
  expect(callsTo(calls, 'POST', 'lists/11/items/reorder/')[0].body).toEqual({ ids: [102, 101] });
});

test('renaming the list', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/': christmasWith([]),
    'PATCH lists/11/': (body) => ({ body: { ...CHRISTMAS, ...(body as object), items: [] } }),
  });
  await renderApp('/lists/11');

  await fireEvent.press(await screen.findByRole('button', { name: 'Rename list' }));
  await fireEvent.changeText(screen.getByLabelText('List name'), 'Christmas 2026');
  await fireEvent.press(screen.getByRole('button', { name: 'Save name' }));

  expect(await screen.findByText('Christmas 2026')).toBeOnTheScreen();
  expect(callsTo(calls, 'PATCH', 'lists/11/')[0].body).toEqual({ name: 'Christmas 2026' });
});

test('deleting a list needs a confirmation and returns to the lists', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, CHRISTMAS] },
    'GET lists/11/': christmasWith([SCARF, BOOK]),
    'DELETE lists/11/': { status: 204 },
  });
  const app = await renderApp('/');
  await fireEvent.press(await screen.findByRole('link', { name: 'Christmas' }));

  await fireEvent.press(await screen.findByRole('button', { name: 'Delete list…' }));
  expect(screen.getByText("This deletes the list and its 2 items. It can't be undone.")).toBeOnTheScreen();
  expect(callsTo(calls, 'DELETE', 'lists/11/')).toHaveLength(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Delete list' }));

  await waitFor(() => expect(app.pathname()).toBe('/'));
  expect(callsTo(calls, 'DELETE', 'lists/11/')).toHaveLength(1);
});

test('deleting an empty list has a simpler warning', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET lists/11/': christmasWith([]) });
  await renderApp('/lists/11');

  await fireEvent.press(await screen.findByRole('button', { name: 'Delete list…' }));

  expect(screen.getByText("This deletes the list. It can't be undone.")).toBeOnTheScreen();
});

test('the default list cannot be deleted', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } } });

  await renderApp('/lists/10');

  expect(
    await screen.findByText('This is your default list. You can rename it, but not delete it.'),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Delete list…' })).not.toBeOnTheScreen();
});
