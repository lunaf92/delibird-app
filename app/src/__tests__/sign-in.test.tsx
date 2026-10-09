import { fireEvent, screen } from 'expo-router/testing-library';

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
