// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    files: ['src/__tests__/**', 'jest.setup.ts'],
    languageOptions: {
      globals: { jest: 'readonly', test: 'readonly', expect: 'readonly', beforeEach: 'readonly' },
    },
  },
]);
