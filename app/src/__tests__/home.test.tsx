import { fireEvent, screen } from 'expo-router/testing-library';

import i18n from '@/i18n';
import { ANN, HEALTHY, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken } from '@/test-utils/storage';

beforeEach(async () => {
  storeToken('my-token');
  await i18n.changeLanguage('en');
});

test('shows the server health message', async () => {
  const calls = mockApi({ 'GET me/': { body: ANN } });

  await renderApp('/');

  expect(await screen.findByText('The server is running.')).toBeOnTheScreen();
  expect(calls.find((call) => call.path === 'health/')?.headers['Accept-Language']).toBe('en');
});

test('greets by email when there is no display name', async () => {
  mockApi({ 'GET me/': { body: { ...ANN, display_name: '' } } });

  await renderApp('/');

  expect(await screen.findByText('Hi, ann@example.com')).toBeOnTheScreen();
});

test('explains when the server cannot be reached, and retries', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET health/': { status: 500 } });
  await renderApp('/');
  expect(await screen.findByText("Can't reach the server at http://localhost:8000.")).toBeOnTheScreen();

  mockApi({ 'GET me/': { body: ANN }, 'GET health/': { body: HEALTHY } });
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('The server is running.')).toBeOnTheScreen();
});

test('opens settings', async () => {
  mockApi({ 'GET me/': { body: ANN }, 'GET auth/sessions/': { body: [] } });
  const app = await renderApp('/');

  await fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));

  expect(await screen.findByText('Signed in as ann@example.com')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/settings');
});
