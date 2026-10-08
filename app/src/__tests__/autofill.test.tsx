import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { firstLink } from '@/api/links';
import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

const FOUND = {
  found: true,
  url: 'https://shop.example.com/scarf',
  name: 'Wool Scarf – Forest Green',
  description: 'Soft merino, 180 cm long.',
  price: '39.90',
  currency: 'GBP',
  image_url: 'https://shop.example.com/files/scarf.jpg',
  problem: null,
};
const NOTHING = {
  ...FOUND,
  found: false,
  name: '',
  description: '',
  price: null,
  currency: null,
  image_url: null,
};

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

function openNewItem(handlers: Parameters<typeof mockApi>[0]) {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
    'POST lists/10/items/': (body) => ({ status: 201, body: item({ id: 105, ...(body as object) }) }),
    'POST items/105/image/from-url/': {
      body: item({ id: 105, image: 'http://localhost:8000/media/items/x.jpg' }),
    },
    ...handlers,
  });
  return {
    calls,
    ready: renderApp('/lists/10/new').then(() => screen.findByText('New item', { exact: true })),
  };
}

test('pasting a shop link fills in the item, and saving keeps the picture', async () => {
  const { calls, ready } = openNewItem({ 'POST items/autofill/': { body: FOUND } });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Link'), 'https://shop.example.com/scarf');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  expect(
    await screen.findByText('Filled in from the shop. Check the details before saving.'),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Name').props.value).toBe('Wool Scarf – Forest Green');
  expect(screen.getByLabelText('Price').props.value).toBe('39.90');
  expect(screen.getByRole('radio', { name: 'GBP' })).toBeSelected();
  expect(callsTo(calls, 'POST', 'items/autofill/')[0].body).toEqual({
    url: 'https://shop.example.com/scarf',
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(callsTo(calls, 'POST', 'items/105/image/from-url/')).toHaveLength(1));
  expect(callsTo(calls, 'POST', 'lists/10/items/')[0].body).toMatchObject({
    name: 'Wool Scarf – Forest Green',
    url: 'https://shop.example.com/scarf',
    price: '39.90',
    currency: 'GBP',
  });
  expect(callsTo(calls, 'POST', 'items/105/image/from-url/')[0].body).toEqual({
    url: 'https://shop.example.com/files/scarf.jpg',
  });
});

test('what the person already typed is kept', async () => {
  const { ready } = openNewItem({ 'POST items/autofill/': { body: FOUND } });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Scarf for Mum');
  await fireEvent.changeText(screen.getByLabelText('Price'), '35');
  await fireEvent.changeText(screen.getByLabelText('Link'), 'https://shop.example.com/scarf');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  await screen.findByText('Filled in from the shop. Check the details before saving.');
  expect(screen.getByLabelText('Name').props.value).toBe('Scarf for Mum');
  expect(screen.getByLabelText('Price').props.value).toBe('35');
  expect(screen.getByRole('radio', { name: 'EUR' })).toBeSelected();
  expect(screen.getByLabelText('Notes').props.value).toBe('Soft merino, 180 cm long.');
});

test('a shop that can not be read leaves the form as it was, with the link', async () => {
  const { calls, ready } = openNewItem({ 'POST items/autofill/': { body: NOTHING } });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Link'), 'https://shop.example.com/scarf');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  expect(
    await screen.findByText("This shop didn't share its details. The link is kept; type the rest."),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Name').props.value).toBe('');
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Scarf');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(callsTo(calls, 'POST', 'lists/10/items/')).toHaveLength(1));
  expect(callsTo(calls, 'POST', 'lists/10/items/')[0].body).toMatchObject({
    url: 'https://shop.example.com/scarf',
  });
  expect(callsTo(calls, 'POST', 'items/105/image/from-url/')).toHaveLength(0);
});

test('links the server refuses are explained in plain words', async () => {
  const { ready } = openNewItem({
    'POST items/autofill/': {
      status: 400,
      body: { url: ["This link can't be read: it isn't a public web address."] },
    },
  });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Link'), 'http://192.168.1.1/');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  expect(
    await screen.findByText(
      "Delibird won't open this link: it points to an address that isn't on the public internet. The link is kept; type the rest.",
    ),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Link').props.value).toBe('http://192.168.1.1/');
});

test.each([
  ['blocked', 'The shop blocked Delibird from reading this page. The link is kept; type the rest.'],
  ['timeout', 'The shop took too long to answer. The link is kept; type the rest or try again later.'],
  ['unreachable', "Delibird couldn't reach this shop. Check the link; it's kept, so you can type the rest."],
  ['unreadable', "Delibird couldn't read this page. The link is kept; type the rest."],
])('when nothing could be read (%s), the app says why and fills nothing', async (problem, text) => {
  const { ready } = openNewItem({
    'POST items/autofill/': {
      body: { ...NOTHING, url: 'https://amzn.eu/d/0386v2Tm', problem },
    },
  });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Link'), 'https://amzn.eu/d/0386v2Tm');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  expect(await screen.findByText(text)).toBeOnTheScreen();
  expect(screen.queryByText(/Filled in from the shop/)).not.toBeOnTheScreen();
  expect(screen.getByLabelText('Name').props.value).toBe('');
  expect(screen.getByLabelText('Link').props.value).toBe('https://amzn.eu/d/0386v2Tm');
});

test('opening /add with a shared link starts a new item from it', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/10/': { body: { ...DEFAULT_LIST, items: [] } },
    'POST items/autofill/': { body: FOUND },
    'POST lists/10/items/': (body) => ({ status: 201, body: item({ id: 105, ...(body as object) }) }),
    'POST items/105/image/from-url/': { body: item({ id: 105 }) },
  });

  const app = await renderApp('/add?text=Look%20at%20this!%20https%3A%2F%2Fshop.example.com%2Fscarf');

  expect(
    await screen.findByText('Filled in from the shop. Check the details before saving.'),
  ).toBeOnTheScreen();
  expect(app.pathname()).toBe('/lists/10/new');
  expect(screen.getByLabelText('Name').props.value).toBe('Wool Scarf – Forest Green');
  expect(callsTo(calls, 'POST', 'items/autofill/')[0].body).toEqual({
    url: 'https://shop.example.com/scarf',
  });

  // There's no screen to go back to, so saving opens the list.
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(app.pathname()).toBe('/lists/10'));
});

test('/add signed out goes through sign-in and comes back', async () => {
  storeToken(null);
  mockApi({});

  const app = await renderApp('/add?url=https%3A%2F%2Fshop.example.com%2Fscarf');

  expect(await screen.findByText('Welcome to Delibird')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in');
});

test('finding the link in shared text', () => {
  expect(firstLink('Look at this! https://shop.example.com/x?a=1 so nice')).toBe(
    'https://shop.example.com/x?a=1',
  );
  expect(firstLink('https://a.example')).toBe('https://a.example');
  expect(firstLink('no link here')).toBeNull();
  expect(firstLink(undefined)).toBeNull();
});

test('when a shop blocks us, the name is guessed from the link and marked as a guess', async () => {
  const link = 'https://www.ikea.com/gb/en/p/kallax-shelving-unit-white-stained-oak-effect-00324518/';
  const { calls, ready } = openNewItem({
    'POST items/autofill/': { body: { ...NOTHING, url: link, problem: 'blocked' } },
  });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Link'), link);
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  expect(
    await screen.findByText(
      'The shop blocked Delibird from reading this page. The link is kept; type the rest.',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('Name').props.value).toBe('Kallax shelving unit white stained oak effect');
  expect(screen.getByText(/Guessed from the link/)).toBeOnTheScreen();
  expect(screen.getByLabelText('Price').props.value).toBe('');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(callsTo(calls, 'POST', 'lists/10/items/')).toHaveLength(1));
  expect(callsTo(calls, 'POST', 'lists/10/items/')[0].body).toMatchObject({
    name: 'Kallax shelving unit white stained oak effect',
    url: link,
  });
});

test('a guessed name never replaces one already typed, and the note goes once it is edited', async () => {
  const link = 'https://www.lecreuset.co.uk/en_GB/p/cast-iron-pumpkin-casserole/CI1238.html';
  const { ready } = openNewItem({
    'POST items/autofill/': { body: { ...NOTHING, url: link, problem: 'blocked' } },
  });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Pumpkin pot');
  await fireEvent.changeText(screen.getByLabelText('Link'), link);
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));
  await screen.findByText(/The shop blocked Delibird/);
  expect(screen.getByLabelText('Name').props.value).toBe('Pumpkin pot');
  expect(screen.queryByText(/Guessed from the link/)).not.toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText('Name'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));
  await waitFor(() => expect(screen.getByLabelText('Name').props.value).toBe('Cast iron pumpkin casserole'));
  expect(screen.getByText(/Guessed from the link/)).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Cast iron pumpkin casserole, 24 cm');
  expect(screen.queryByText(/Guessed from the link/)).not.toBeOnTheScreen();
});

test('short links with nothing to go on leave the name empty', async () => {
  const { ready } = openNewItem({
    'POST items/autofill/': { body: { ...NOTHING, url: 'https://ebay.io/m/wYOGiR', problem: 'blocked' } },
  });
  await ready;

  await fireEvent.changeText(screen.getByLabelText('Link'), 'https://ebay.io/m/wYOGiR');
  await fireEvent.press(screen.getByRole('button', { name: 'Fill in from link' }));

  await screen.findByText(/The shop blocked Delibird/);
  expect(screen.getByLabelText('Name').props.value).toBe('');
  expect(screen.queryByText(/Guessed from the link/)).not.toBeOnTheScreen();
});
