import { Linking, Platform } from 'react-native';
import { fireEvent, screen } from 'expo-router/testing-library';

import * as openInApp from '@/auth/open-in-app';
import i18n from '@/i18n';
import { ANN, callsTo, mockApi } from '@/test-utils/api';
import { renderApp } from '@/test-utils/render';
import { storeToken, storedToken } from '@/test-utils/storage';

const SENT = { status: 202, body: { detail: "We've emailed you a sign-in code. It expires in 10 minutes." } };
const SIGNED_IN = { body: { token: 'new-token', user: ANN } };

beforeEach(async () => {
  storeToken(null);
  await i18n.changeLanguage('en');
});

async function requestCodeFor(email: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));
  await screen.findByText('Check your email');
}

test('signing in with an emailed code', async () => {
  const calls = mockApi({ 'POST auth/request-code/': SENT, 'POST auth/verify/': SIGNED_IN });
  const app = await renderApp('/sign-in');

  await requestCodeFor(' ann@example.com ');
  expect(callsTo(calls, 'POST', 'auth/request-code/')[0].body).toEqual({ email: 'ann@example.com' });
  expect(screen.getByText(/We sent a six-digit code to ann@example.com/)).toBeOnTheScreen();

  await fireEvent.changeText(screen.getByLabelText('Code'), '12 34 56');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/');
  expect(callsTo(calls, 'POST', 'auth/verify/')[0].body).toMatchObject({
    email: 'ann@example.com',
    code: '123456',
  });
  expect(storedToken()).toBe('new-token');
});

test('the app switches to the language saved on the account', async () => {
  mockApi({
    'POST auth/request-code/': SENT,
    'POST auth/verify/': { body: { token: 'new-token', user: { ...ANN, language: 'it' } } },
  });
  await renderApp('/sign-in');
  await requestCodeFor('ann@example.com');

  await fireEvent.changeText(screen.getByLabelText('Code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('Ciao, Ann')).toBeOnTheScreen();
  expect(i18n.language).toBe('it');
});

test('a wrong code shows the server message and stays on the code screen', async () => {
  mockApi({
    'POST auth/request-code/': SENT,
    'POST auth/verify/': { status: 400, body: { detail: 'That code is wrong or has expired.' } },
  });
  const app = await renderApp('/sign-in');
  await requestCodeFor('ann@example.com');

  await fireEvent.changeText(screen.getByLabelText('Code'), '000000');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('That code is wrong or has expired.')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/sign-in/code');
  expect(storedToken()).toBeUndefined();
});

test('a short code is caught before asking the server', async () => {
  const calls = mockApi({ 'POST auth/request-code/': SENT });
  await renderApp('/sign-in');
  await requestCodeFor('ann@example.com');

  await fireEvent.changeText(screen.getByLabelText('Code'), '123');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByText('The code has six digits.')).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'auth/verify/')).toHaveLength(0);
});

test('asking for a new code', async () => {
  const calls = mockApi({ 'POST auth/request-code/': SENT });
  await renderApp('/sign-in');
  await requestCodeFor('ann@example.com');

  await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));

  expect(await screen.findByText('We sent you a new code.')).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'auth/request-code/')).toHaveLength(2);
});

test('too many requests are explained', async () => {
  mockApi({ 'POST auth/request-code/': { status: 429, body: { detail: 'Request was throttled.' } } });
  await renderApp('/sign-in');

  await fireEvent.changeText(screen.getByLabelText('Email'), 'ann@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));

  expect(await screen.findByText('Too many attempts. Wait a few minutes and try again.')).toBeOnTheScreen();
});

test('an invalid email is caught before asking the server', async () => {
  const calls = mockApi({});
  await renderApp('/sign-in');

  await fireEvent.changeText(screen.getByLabelText('Email'), 'not-an-email');
  await fireEvent.press(screen.getByRole('button', { name: 'Send me a code' }));

  expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
  expect(callsTo(calls, 'POST', 'auth/request-code/')).toHaveLength(0);
});

test('the magic link signs in', async () => {
  const calls = mockApi({ 'POST auth/verify/': SIGNED_IN });

  const app = await renderApp('/sign-in/verify?token=magic-token');

  expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  expect(app.pathname()).toBe('/');
  const verifyCalls = callsTo(calls, 'POST', 'auth/verify/');
  expect(verifyCalls).toHaveLength(1);
  expect(verifyCalls[0].body).toMatchObject({ token: 'magic-token' });
  expect(storedToken()).toBe('new-token');
});

test('an expired magic link explains what to do', async () => {
  mockApi({ 'POST auth/verify/': { status: 400, body: { detail: 'That code is wrong or has expired.' } } });

  await renderApp('/sign-in/verify?token=old-token');

  expect(await screen.findByText('That code is wrong or has expired.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(await screen.findByText('Welcome to Strena')).toBeOnTheScreen();
});

describe('opening the magic link in the app', () => {
  afterEach(() => jest.restoreAllMocks());

  test('an Android browser offers the app first and does not use the token yet', async () => {
    jest.spyOn(openInApp, 'canOpenAppFromBrowser').mockReturnValue(true);
    const calls = mockApi({ 'POST auth/verify/': SIGNED_IN });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    await renderApp('/sign-in/verify?token=magic-token');

    expect(await screen.findByText('Open Strena')).toBeOnTheScreen();
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('intent://sign-in/verify?token=magic-token#Intent;'),
    );
    expect(callsTo(calls, 'POST', 'auth/verify/')).toHaveLength(0);

    await fireEvent.press(screen.getByRole('button', { name: 'Continue in the browser' }));
    expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
    expect(callsTo(calls, 'POST', 'auth/verify/')).toHaveLength(1);
  });

  test('the website choice (web=1) signs in straight away', async () => {
    jest.spyOn(openInApp, 'canOpenAppFromBrowser').mockReturnValue(true);
    mockApi({ 'POST auth/verify/': SIGNED_IN });

    await renderApp('/sign-in/verify?token=magic-token&web=1');

    expect(await screen.findByText('Hi, Ann')).toBeOnTheScreen();
  });

  test('the intent link names the app and falls back to the website', () => {
    const url = openInApp.androidIntentUrl('a b', '/sign-in/verify?token=a%20b&web=1');
    expect(url).toContain(
      'intent://sign-in/verify?token=a%20b#Intent;scheme=delibird;package=com.lunaf92.delibird;',
    );
    expect(url).toContain('S.browser_fallback_url=%2Fsign-in%2Fverify%3Ftoken%3Da%2520b%26web%3D1;end');
  });
});

test('the privacy policy opens from sign-in without an account', async () => {
  mockApi({});
  const app = await renderApp('/sign-in');

  await fireEvent.press(await screen.findByRole('button', { name: 'Privacy policy' }));

  expect(await screen.findByText('Who runs Strena')).toBeOnTheScreen();
  expect(screen.getAllByText(/infostrena@proton\.me/)[0]).toBeOnTheScreen();
  expect(app.pathname()).toBe('/privacy');
});

test('the privacy policy is in the chosen language', async () => {
  mockApi({});
  await i18n.changeLanguage('it');
  await renderApp('/privacy');

  expect(await screen.findByText('Chi gestisce Strena')).toBeOnTheScreen();
});

test('on Android, the code screen opens the email app', async () => {
  const launcher = jest.requireMock<{ startActivityAsync: jest.Mock }>('expo-intent-launcher');
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  mockApi({ 'POST auth/request-code/': SENT });
  await renderApp('/sign-in');
  await requestCodeFor('ann@example.com');

  await fireEvent.press(screen.getByRole('button', { name: 'Open my email app' }));

  expect(launcher.startActivityAsync).toHaveBeenCalledWith('android.intent.action.MAIN', {
    category: 'android.intent.category.APP_EMAIL',
    flags: 0x10000000,
  });
  os.restore();
});
