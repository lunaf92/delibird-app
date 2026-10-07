import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, HEALTHY, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const BIRTHDAY = { ...DEFAULT_LIST, id: 11, name: 'Birthday', is_default: false, position: 1, item_count: 3 };

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

test('shows the lists with their item counts', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET lists/': { body: [DEFAULT_LIST, BIRTHDAY] } });

  await renderApp('/');

  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(await screen.findByText('Birthday')).toBeOnTheScreen();
  expect(screen.getByText('0 items · default list')).toBeOnTheScreen();
  expect(screen.getByText('3 items')).toBeOnTheScreen();
});

test('greets by email when there is no display name', async () => {
  mockApi({ 'GET me/': { body: { ...ANN, display_name: '' } } });

  await renderApp('/');

  expect(await screen.findByText('Hi, ann@example.com')).toBeOnTheScreen();
});

test('creating a list adds it at the end', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'POST lists/': (body) => ({ status: 201, body: { ...BIRTHDAY, ...(body as object), item_count: 0 } }),
  });
  await renderApp('/');
  await screen.findByText('My wishlist');

  await fireEvent.changeText(screen.getByLabelText('List name'), '  Christmas  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Create list' }));

  expect(await screen.findByText('Christmas')).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'lists/')[0].body).toEqual({ name: 'Christmas' });
  expect(screen.getByLabelText('List name').props.value).toBe('');
});

test('moving a list down saves the new order', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, BIRTHDAY] },
    'POST lists/reorder/': { status: 204 },
  });
  await renderApp('/');
  await screen.findByText('Birthday');
  expect(screen.getByRole('button', { name: 'Move My wishlist up' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: 'Move My wishlist down' }));

  await waitFor(() => expect(callsTo(calls, 'POST', 'lists/reorder/')).toHaveLength(1));
  expect(callsTo(calls, 'POST', 'lists/reorder/')[0].body).toEqual({ ids: [11, 10] });
  const names = screen.getAllByRole('link').map((link) => link.props.accessibilityLabel);
  expect(names).toEqual(['Birthday', 'My wishlist']);
});

test('opening a list', async () => {
  mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, BIRTHDAY] },
    'GET lists/11/': { body: { ...BIRTHDAY, item_count: 0, items: [] } },
  });
  const app = await renderApp('/');

  await fireEvent.press(await screen.findByRole('link', { name: 'Birthday' }));

  expect(await screen.findByText("Nothing here yet. Add the first thing you'd like.")).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/11');
});

test('settings shows whether the server is reachable', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET auth/sessions/': { body: [] }, 'GET health/': { status: 500 } });
  const app = await renderApp('/');

  await fireEvent.press(await screen.findByRole('link', { name: 'Settings' }));

  expect(app.pathname()).toBe('/settings');
  expect(await screen.findByText("Can't reach the server at http://localhost:8000.")).toBeOnTheScreen();
  mockApi({ 'GET me/': { body: ANN }, 'GET auth/sessions/': { body: [] }, 'GET health/': { body: HEALTHY } });
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('The server is running.')).toBeOnTheScreen();
});
