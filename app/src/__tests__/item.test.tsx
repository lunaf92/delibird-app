import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, callsTo, DEFAULT_LIST, item, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
const pickImage = ImagePicker.launchImageLibraryAsync as jest.Mock;

const CHRISTMAS = { ...DEFAULT_LIST, id: 11, name: 'Christmas', is_default: false };
const SCARF = item({
  id: 101,
  lists: [10, 11],
  name: 'Wool scarf',
  url: 'https://shop.example.com/scarf',
  price: '39.90',
  rating: 4,
  image: 'http://localhost:8000/media/items/abc.jpg',
});

beforeEach(async () => {
  storeToken('my-token');
  pickImage.mockReset();
  await i18n.changeLanguage('en');
});

async function openNewItemForm(handlers: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/11/': { body: { ...CHRISTMAS, items: [] } },
    'POST lists/11/items/': (body) => ({
      status: 201,
      body: item({ id: 105, lists: [10, 11], ...(body as object) }),
    }),
    ...handlers,
  });
  const app = await renderApp('/lists/11');
  await fireEvent.press(await screen.findByRole('button', { name: 'Add an item' }));
  await screen.findByText('New item', { exact: true });
  return { calls, app };
}

test('adding an item with every field', async () => {
  const { calls, app } = await openNewItemForm();

  await fireEvent.changeText(screen.getByLabelText('Name'), ' Wool scarf ');
  await fireEvent.changeText(screen.getByLabelText('Link'), 'https://shop.example.com/scarf');
  await fireEvent.changeText(screen.getByLabelText('Notes'), 'The green one');
  await fireEvent.press(screen.getByRole('radio', { name: '4 stars' }));
  await fireEvent.changeText(screen.getByLabelText('Price'), '39,9');
  await fireEvent.press(screen.getByRole('radio', { name: 'GBP' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(app.pathname()).toBe('/lists/11'));
  expect(callsTo(calls, 'POST', 'lists/11/items/')[0].body).toEqual({
    name: 'Wool scarf',
    url: 'https://shop.example.com/scarf',
    description: 'The green one',
    rating: 4,
    price: '39.90',
    currency: 'GBP',
  });
});

test('only the name is required', async () => {
  const { calls } = await openNewItemForm();

  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Give the item a name.')).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Book');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(callsTo(calls, 'POST', 'lists/11/items/')).toHaveLength(1));
  expect(callsTo(calls, 'POST', 'lists/11/items/')[0].body).toMatchObject({
    name: 'Book',
    price: null,
    rating: null,
    currency: 'EUR',
  });
});

test.each([
  ['Link', 'shop.example.com', 'Enter a full link, starting with https://'],
  ['Price', 'about forty', 'Enter a price such as 39.90.'],
])('a bad %s is caught before saving', async (label, value, message) => {
  const { calls } = await openNewItemForm();

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Book');
  await fireEvent.changeText(screen.getByLabelText(label), value);
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText(message)).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'lists/11/items/')).toHaveLength(0);
});

test('a picture is uploaded after the item is saved', async () => {
  pickImage.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///photos/scarf.jpg', fileName: 'scarf.jpg', mimeType: 'image/jpeg' }],
  });
  const { calls } = await openNewItemForm({
    'PUT items/105/image/': { body: item({ id: 105, image: 'http://localhost:8000/media/items/x.jpg' }) },
  });

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Scarf');
  await fireEvent.press(screen.getByRole('button', { name: 'Add a picture' }));
  expect(await screen.findByRole('button', { name: 'Change picture' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(callsTo(calls, 'PUT', 'items/105/image/')).toHaveLength(1));
  const upload = callsTo(calls, 'PUT', 'items/105/image/')[0];
  expect(upload.body).toBeInstanceOf(FormData);
  expect(upload.headers['Content-Type']).toBeUndefined();
  // On a phone the picture goes in as a File (a Blob Expo's fetch can send), not as a { uri, name, type }
  // object, which Expo's fetch fails on before sending anything.
  const part = (upload.body as FormData).get('image') as Blob & { name?: string };
  expect(part).toBeInstanceOf(Blob);
  expect(part.name).toBe('scarf.jpg');
  expect((File as unknown as { created: string[] }).created).toContain('file:///photos/scarf.jpg');
});

test('editing an item, choosing its lists and removing its picture', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, CHRISTMAS] },
    'GET items/101/': { body: SCARF },
    'PATCH items/101/': (body) => ({ body: { ...SCARF, ...(body as object) } }),
    'DELETE items/101/image/': { body: { ...SCARF, image: null } },
  });
  await renderApp('/items/101');

  expect(await screen.findByDisplayValue('Wool scarf')).toBeOnTheScreen();
  expect(screen.getByDisplayValue('39.90')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Green wool scarf');
  await fireEvent.press(screen.getByRole('radio', { name: '4 stars' })); // Tapping the same star clears it.
  // The default list can't be unticked; Christmas can.
  expect(screen.getByRole('checkbox', { name: 'My wishlist' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Christmas' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove picture' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(callsTo(calls, 'DELETE', 'items/101/image/')).toHaveLength(1));
  expect(callsTo(calls, 'PATCH', 'items/101/')[0].body).toMatchObject({
    name: 'Green wool scarf',
    rating: null,
    lists: [10],
  });
});

test('deleting an item needs a confirmation', async () => {
  const calls = mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, CHRISTMAS] },
    'GET items/101/': { body: SCARF },
    'DELETE items/101/': { status: 204 },
  });
  await renderApp('/items/101');

  await fireEvent.press(await screen.findByRole('button', { name: 'Delete item…' }));
  expect(screen.getByText("Delete “Wool scarf” from all your lists? It can't be undone.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Delete item' }));

  await waitFor(() => expect(callsTo(calls, 'DELETE', 'items/101/')).toHaveLength(1));
});

test('server validation errors are shown', async () => {
  await openNewItemForm({
    'POST lists/11/items/': { status: 400, body: { detail: 'Something about the item was wrong.' } },
  });

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Book');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Something about the item was wrong.')).toBeOnTheScreen();
});

const PICTURE = {
  canceled: false,
  assets: [{ uri: 'file:///photos/scarf.jpg', fileName: 'scarf.jpg', mimeType: 'image/jpeg' }],
};

async function saveNewItemWithPicture() {
  pickImage.mockResolvedValue(PICTURE);
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Scarf');
  await fireEvent.press(screen.getByRole('button', { name: 'Add a picture' }));
  await screen.findByRole('button', { name: 'Change picture' });
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
}

test('a new item whose picture fails is removed again, and the form keeps what was typed', async () => {
  // The upload has no handler, so it fails like an unreachable server.
  const { calls } = await openNewItemForm({ 'DELETE items/105/': { status: 204 } });

  await saveNewItemWithPicture();

  expect(await screen.findByText(/nothing was saved/)).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'lists/11/items/')).toHaveLength(1);
  expect(callsTo(calls, 'DELETE', 'items/105/')).toHaveLength(1);
  expect(screen.getByDisplayValue('Scarf')).toBeOnTheScreen();
  expect(screen.getByText('New item', { exact: true })).toBeOnTheScreen();
});

test('if the new item cannot be removed either, Save only retries the picture', async () => {
  let uploads = 0;
  const { calls } = await openNewItemForm({
    'PATCH items/105/': (body) => ({ body: item({ id: 105, lists: [10, 11], ...(body as object) }) }),
    'PUT items/105/image/': () => {
      uploads += 1;
      if (uploads === 1) throw new TypeError('Network request failed');
      return { body: item({ id: 105, image: 'http://localhost:8000/media/items/x.jpg' }) };
    },
  });

  await saveNewItemWithPicture();
  expect(await screen.findByText(/The item was saved, but its picture/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(uploads).toBe(2));
  expect(callsTo(calls, 'POST', 'lists/11/items/')).toHaveLength(1);
  expect(callsTo(calls, 'PATCH', 'items/105/')).toHaveLength(1);
});

test('editing an item says so when only the picture fails', async () => {
  pickImage.mockResolvedValue(PICTURE);
  mockApi({
    'GET me/': { body: ANN },
    'GET lists/': { body: [DEFAULT_LIST, CHRISTMAS] },
    'GET items/101/': { body: SCARF },
    'PATCH items/101/': (body) => ({ body: { ...SCARF, ...(body as object) } }),
  });
  await renderApp('/items/101');

  await fireEvent.press(await screen.findByRole('button', { name: 'Change picture' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText(/Your changes were saved, but the picture/)).toBeOnTheScreen();
});
