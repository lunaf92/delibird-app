import * as Clipboard from 'expo-clipboard';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const CHRISTMAS = { ...DEFAULT_LIST, id: 11, name: 'Christmas', is_default: false };
const BOB = {
  id: 1,
  email: 'bob@example.com',
  joined: true,
  joined_as: 'Bob',
  created_at: '2026-10-01T10:00:00Z',
};
const CAROL = {
  id: 2,
  email: 'carol@example.com',
  joined: false,
  joined_as: null,
  created_at: '2026-10-02T10:00:00Z',
};

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

test('the list screen says whether the list is shared and opens sharing', async () => {
  mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/': { body: { ...CHRISTMAS, is_shared: true, items: [] } },
    'GET lists/11/shares/': { body: [BOB, CAROL] },
  });
  const app = await renderApp('/lists/11');

  expect(await screen.findByText('Shared with people who have a link.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Share this list…' }));

  expect(await screen.findByText('Opened by Bob')).toBeOnTheScreen();
  expect(screen.getByText('Not opened yet')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/11/sharing');
});

test('sharing with someone shows their link once and copies it', async () => {
  let shares: unknown[] = [];
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/shares/': () => ({ body: shares }),
    'POST lists/11/shares/': (body) => {
      shares = [CAROL];
      return {
        status: 201,
        body: { ...CAROL, ...(body as object), link: 'http://localhost:8081/shared/abc' },
      };
    },
  });
  await renderApp('/lists/11/sharing');
  expect(await screen.findByText('Not shared with anyone yet.')).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText('Their email'), ' carol@example.com ');
  await fireEvent.press(screen.getByRole('button', { name: 'Create their link' }));

  expect(await screen.findByText('http://localhost:8081/shared/abc')).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'lists/11/shares/')[0].body).toEqual({ email: 'carol@example.com' });
  expect(await screen.findByText('Not opened yet')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Copy link' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('http://localhost:8081/shared/abc');
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeOnTheScreen();
});

test('sharing twice with the same address shows the server message', async () => {
  mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/shares/': { body: [BOB] },
    'POST lists/11/shares/': {
      status: 400,
      body: { detail: 'This list is already shared with that address.' },
    },
  });
  await renderApp('/lists/11/sharing');
  await screen.findByText('Opened by Bob');

  await fireEvent.changeText(screen.getByLabelText('Their email'), 'bob@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Create their link' }));

  expect(await screen.findByText('This list is already shared with that address.')).toBeOnTheScreen();
});

test('stopping a share needs a confirmation', async () => {
  let shares: unknown[] = [BOB];
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/shares/': () => ({ body: shares }),
    'DELETE shares/1/': () => {
      shares = [];
      return { status: 204 };
    },
  });
  await renderApp('/lists/11/sharing');

  await fireEvent.press(await screen.findByRole('button', { name: 'Stop sharing…' }));
  expect(screen.getByText("bob@example.com's link will stop working.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Stop sharing' }));

  expect(await screen.findByText('Not shared with anyone yet.')).toBeOnTheScreen();
  expect(callsTo(calls, 'DELETE', 'shares/1/')).toHaveLength(1);
});

describe('editing items on a shared list', () => {
  const SCARF = item({ id: 101, lists: [10, 11], name: 'Wool scarf' });

  function openItem(isShared: boolean) {
    const calls = mockApi({
      'GET me/': { body: ANN },
      'GET lists/': { body: [DEFAULT_LIST, { ...CHRISTMAS, is_shared: isShared }] },
      'GET items/101/': { body: { ...SCARF, on_shared_list: isShared } },
      'PATCH items/101/': (body) => ({ body: { ...SCARF, ...(body as object) } }),
      'DELETE items/101/': { status: 204 },
    });
    return { calls, ready: renderApp('/items/101').then(() => screen.findByDisplayValue('Wool scarf')) };
  }

  test('saving asks first, whether or not anything is reserved', async () => {
    const { calls, ready } = openItem(true);
    await ready;

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Red scarf');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Someone may already have bought this. Continue?')).toBeOnTheScreen();
    expect(callsTo(calls, 'PATCH', 'items/101/')).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(callsTo(calls, 'PATCH', 'items/101/')).toHaveLength(1));
  });

  test('cancelling the warning saves nothing', async () => {
    const { calls, ready } = openItem(true);
    await ready;

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Someone may already have bought this. Continue?')).not.toBeOnTheScreen();
    expect(callsTo(calls, 'PATCH', 'items/101/')).toHaveLength(0);
  });

  test('deleting warns too', async () => {
    const { ready } = openItem(true);
    await ready;

    await fireEvent.press(screen.getByRole('button', { name: 'Delete item…' }));

    expect(screen.getByText('Someone may already have bought this. Continue?')).toBeOnTheScreen();
  });

  test('lists that are not shared save straight away', async () => {
    const { calls, ready } = openItem(false);
    await ready;

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(callsTo(calls, 'PATCH', 'items/101/')).toHaveLength(1));
    expect(screen.queryByText('Someone may already have bought this. Continue?')).not.toBeOnTheScreen();
  });
});
