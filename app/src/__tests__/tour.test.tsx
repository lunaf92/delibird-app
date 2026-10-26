import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const NEW_ANN = { ...ANN, tour_seen: false };
const SEEN_ANN = { ...ANN, tour_seen: true };

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

async function nextUntilTheEnd() {
  for (let step = 0; step < 5; step++) {
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  }
  expect(screen.getByText('Shall we add your first wish?')).toBeOnTheScreen();
}

test('a new account sees the tour once, and it is remembered on the account', async () => {
  const calls = mockApi({
    'GET me/': { body: NEW_ANN },
    'PATCH me/': { body: SEEN_ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
  });
  const app = await renderApp('/');

  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/tour');
  await waitFor(() => expect(callsTo(calls, 'PATCH', 'me/')).toHaveLength(1));
  expect(callsTo(calls, 'PATCH', 'me/')[0].body).toEqual({ tour_seen: true });

  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Add things from any shop')).toBeOnTheScreen();
  expect(screen.getByText(/in your browser and pick Strena/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Welcome to Strena')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Skip tour' }));
  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/');
  expect(screen.queryByTestId('guide-note')).not.toBeOnTheScreen();
});

test('accounts that have seen it go straight to their lists', async () => {
  const calls = mockApi({ 'GET me/': { body: SEEN_ANN } });
  const app = await renderApp('/');

  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/');
  expect(callsTo(calls, 'PATCH', 'me/')).toHaveLength(0);
});

test('the guide walks through a first item and putting it on a second list', async () => {
  const birthday = { ...DEFAULT_LIST, id: 11, name: 'Birthday', is_default: false, position: 1 };
  let lists = [DEFAULT_LIST];
  let book = item({ id: 100, lists: [10], name: 'Book' });
  let items: ReturnType<typeof item>[] = [];
  const calls = mockApi({
    'GET me/': { body: NEW_ANN },
    'PATCH me/': { body: SEEN_ANN },
    'GET lists/': () => ({ body: lists }),
    'GET lists/10/': () => ({ body: { ...DEFAULT_LIST, items } }),
    'POST lists/10/items/': (body) => {
      book = item({ id: 100, lists: [10], ...(body as object) });
      items = [book];
      return { status: 201, body: book };
    },
    'POST lists/': () => {
      lists = [DEFAULT_LIST, birthday];
      return { status: 201, body: birthday };
    },
    'GET items/100/': () => ({ body: book }),
    'PATCH items/100/': (body) => {
      book = { ...book, ...(body as object) };
      items = [book];
      return { body: book };
    },
  });
  const app = await renderApp('/');

  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
  await nextUntilTheEnd();
  await fireEvent.press(screen.getByRole('button', { name: 'Show me how' }));

  // 1: the main list, pointing at the add button.
  expect(await screen.findByText(/Tap “Add an item” below/)).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/10');
  await fireEvent.press(screen.getByRole('button', { name: 'Add an item' }));

  // 2: the form.
  expect(await screen.findByText(/or just type a name/)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Book');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  // 3: back on the list, making a second list.
  expect(await screen.findByText(/“Book” is on your list/)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Name of the second list'), 'Birthday');
  await fireEvent.press(screen.getByRole('button', { name: 'Make the list' }));
  expect(callsTo(calls, 'POST', 'lists/')[0].body).toEqual({ name: 'Birthday' });

  // 4: open the item and tick the new list.
  expect(await screen.findByText(/tick “Birthday” under Lists/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('link', { name: 'Book' }));
  expect(await screen.findByText('Tick “Birthday” under Lists, then tap Save.')).toBeOnTheScreen();
  await fireEvent.press(await screen.findByRole('checkbox', { name: 'Birthday' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText(/“Book” is now on more than one list/)).toBeOnTheScreen();
  expect(callsTo(calls, 'PATCH', 'items/100/')[0].body).toMatchObject({ lists: [10, 11] });
  await fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
  expect(screen.queryByTestId('guide-note')).not.toBeOnTheScreen();
});

test('the guide can be stopped at any step', async () => {
  mockApi({
    'GET me/': { body: SEEN_ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
  });
  await renderApp('/settings');

  await fireEvent.press(await screen.findByRole('button', { name: 'Walk me through adding an item' }));

  expect(await screen.findByText(/Tap “Add an item” below/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Stop the guide' }));
  expect(screen.queryByTestId('guide-note')).not.toBeOnTheScreen();
});

test('the tour can be watched again from Settings', async () => {
  const calls = mockApi({ 'GET me/': { body: SEEN_ANN } });
  const app = await renderApp('/settings');

  await fireEvent.press(await screen.findByRole('button', { name: 'Show the welcome tour again' }));

  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/tour');
  await nextUntilTheEnd();
  await fireEvent.press(screen.getByRole('button', { name: "I'll look around myself" }));
  expect(await screen.findByRole('button', { name: 'Show the welcome tour again' })).toBeOnTheScreen();
  expect(callsTo(calls, 'PATCH', 'me/')).toHaveLength(0);
});

test('the tour follows the language of the account', async () => {
  mockApi({
    'GET me/': { body: { ...NEW_ANN, language: 'it' } },
    'PATCH me/': { body: { ...SEEN_ANN, language: 'it' } },
  });
  await renderApp('/');
  expect(await screen.findByText('Benvenuto in Strena')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Avanti' }));
  expect(screen.getByText(/nel browser e scegli Strena/)).toBeOnTheScreen();
});
