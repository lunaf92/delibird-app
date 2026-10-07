import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { callsTo, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const BOB = { id: 2, email: 'bob@example.com', display_name: 'Bob', language: 'en' as const };
const SUMMARY = { id: 11, name: 'Christmas', owner_name: 'Ann', item_count: 3 };

function viewerList(states: Record<number, { status: string; by: string | null }>) {
  return {
    body: {
      ...SUMMARY,
      items: [
        { ...item({ id: 101, name: 'Wool scarf' }), reservation: states[101] },
        { ...item({ id: 102, name: 'Bike' }), reservation: states[102] },
        { ...item({ id: 103, name: 'Book' }), reservation: states[103] },
      ],
    },
  };
}

const FREE = { status: 'free', by: null };
const MINE = { status: 'mine', by: null };

beforeEach(async () => {
  storeToken('bob-token');
  await i18n.changeLanguage('en');
});

test('shared lists appear on the home screen', async () => {
  mockApi({ 'GET me/': { body: BOB }, 'GET shared-with-me/': { body: [SUMMARY] } });
  const app = await renderApp('/');

  expect(await screen.findByText('Shared with me')).toBeOnTheScreen();
  expect(screen.getByText('From Ann · 3 items')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('link', { name: 'Christmas' }));

  await waitFor(() => expect(app.pathname()).toBe('/shared-with-me/11'));
});

test('what a viewer sees: free, mine and taken', async () => {
  mockApi({
    'GET me/': { body: BOB },
    'GET shared-with-me/11/': viewerList({ 101: FREE, 102: MINE, 103: { status: 'taken', by: 'Carol' } }),
  });

  await renderApp('/shared-with-me/11');

  expect(await screen.findByText("Ann can't see what anyone is getting.")).toBeOnTheScreen();
  expect(screen.getAllByRole('button', { name: "I'll get this" })).toHaveLength(1);
  expect(screen.getByText("You're getting this.")).toBeOnTheScreen();
  expect(screen.getByText('Carol is getting this.')).toBeOnTheScreen();
});

test('reserving and cancelling', async () => {
  let state = FREE;
  const calls = mockApi({
    'GET me/': { body: BOB },
    'GET shared-with-me/11/': () => viewerList({ 101: state, 102: FREE, 103: FREE }),
    'POST items/101/reservation/': () => {
      state = MINE;
      return { status: 204 };
    },
    'DELETE items/101/reservation/': () => {
      state = FREE;
      return { status: 204 };
    },
  });
  await renderApp('/shared-with-me/11');
  await screen.findByText('Wool scarf');

  await fireEvent.press(screen.getAllByRole('button', { name: "I'll get this" })[0]);
  expect(await screen.findByText("You're getting this.")).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'items/101/reservation/')).toHaveLength(1);

  await fireEvent.press(screen.getByRole('button', { name: "I won't get it after all" }));
  await waitFor(() => expect(screen.queryByText("You're getting this.")).not.toBeOnTheScreen());
  expect(callsTo(calls, 'DELETE', 'items/101/reservation/')).toHaveLength(1);
});

test('when someone else got there first', async () => {
  let state: { status: string; by: string | null } = FREE;
  mockApi({
    'GET me/': { body: BOB },
    'GET shared-with-me/11/': () => viewerList({ 101: state, 102: FREE, 103: FREE }),
    'POST items/101/reservation/': () => {
      state = { status: 'taken', by: 'Carol' };
      return { status: 409, body: { detail: 'Someone else is already getting this.' } };
    },
  });
  await renderApp('/shared-with-me/11');
  await screen.findByText('Wool scarf');

  await fireEvent.press(screen.getAllByRole('button', { name: "I'll get this" })[0]);

  expect(await screen.findByText('Someone else is already getting this.')).toBeOnTheScreen();
  expect(await screen.findByText('Carol is getting this.')).toBeOnTheScreen();
});
