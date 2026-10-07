import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import type { ReactElement } from 'react';

import i18n from '@/i18n';
import HomeScreen from '@/app/index';

function render(ui: ReactElement) {
  return rtlRender(<ThemeProvider value={DefaultTheme}>{ui}</ThemeProvider>);
}

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

function respondWith(message: string, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status === 200,
    status,
    json: async () => ({
      status: status === 200 ? 'ok' : 'degraded',
      database: true,
      redis: true,
      language: 'en',
      message,
    }),
  });
}

beforeEach(async () => {
  mockFetch.mockReset();
  await i18n.changeLanguage('en');
});

test('shows the server health message', async () => {
  respondWith('The server is running.');

  await render(<HomeScreen />);

  expect(await screen.findByText('The server is running.')).toBeOnTheScreen();
  expect(mockFetch).toHaveBeenCalledWith(
    'http://localhost:8000/api/v1/health/',
    expect.objectContaining({ headers: expect.objectContaining({ 'Accept-Language': 'en' }) }),
  );
});

test('switching language translates the screen and asks the server in that language', async () => {
  respondWith('The server is running.');
  respondWith('Il server è in funzione.');
  await render(<HomeScreen />);
  await screen.findByText('The server is running.');

  await fireEvent.press(screen.getByText('Italiano'));

  expect(await screen.findByText('Il server è in funzione.')).toBeOnTheScreen();
  expect(screen.getByText('Qui vivranno le tue liste dei desideri')).toBeOnTheScreen();
  expect(mockFetch).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ headers: expect.objectContaining({ 'Accept-Language': 'it' }) }),
  );
});

test('explains when the server cannot be reached', async () => {
  mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

  await render(<HomeScreen />);

  expect(await screen.findByText("Can't reach the server at http://localhost:8000.")).toBeOnTheScreen();
});
