import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import it from './locales/it.json';

export const SUPPORTED_LANGUAGES = ['en', 'it', 'es'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export function isSupportedLanguage(code: string | null | undefined): code is Language {
  return SUPPORTED_LANGUAGES.includes(code as Language);
}

/** The first device language we support, falling back to English. */
export function deviceLanguage(): Language {
  const match = getLocales().find((locale) => isSupportedLanguage(locale.languageCode));
  return isSupportedLanguage(match?.languageCode) ? match.languageCode : 'en';
}

// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented setup
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
    es: { translation: es },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
