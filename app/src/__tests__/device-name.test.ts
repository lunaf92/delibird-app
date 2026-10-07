import { Platform } from 'react-native';

import { deviceName } from '@/auth/context';

const AGENTS: [string, string][] = [
  [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    'Chrome on Linux',
  ],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox on Windows'],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
    'Safari on iOS',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
    'Edge on Windows',
  ],
];

describe('on the web', () => {
  const original = Platform.OS;
  beforeAll(() => {
    Platform.OS = 'web';
  });
  afterAll(() => {
    Platform.OS = original;
  });

  test.each(AGENTS)('%s is "%s"', (userAgent, expected) => {
    expect(deviceName(userAgent)).toBe(expected);
  });

  test('an unknown browser is left to the server', () => {
    expect(deviceName('curl/8.0')).toBeUndefined();
  });
});
