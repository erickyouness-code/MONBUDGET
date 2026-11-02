import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';

import { RTL_LANGUAGES, resolveLanguage, type Language } from './languages';
import { ar } from './locales/ar';
import { en } from './locales/en';
import { fr } from './locales/fr';

export const resources = {
  fr: { translation: fr },
  ar: { translation: ar },
  en: { translation: en },
} as const;

export function deviceLanguageCode(): string | null {
  return getLocales()[0]?.languageCode ?? null;
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(null, deviceLanguageCode()),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false }, // React protège déjà contre l'injection HTML
  returnNull: false,
});

export function isRTLLanguage(language: Language): boolean {
  return RTL_LANGUAGES.has(language);
}

/**
 * Applique le sens d'écriture (gauche→droite ou droite→gauche).
 * Retourne true si l'application doit redémarrer pour que le changement
 * soit visible (c'est une contrainte de React Native sur iOS et Android).
 */
export function applyLayoutDirection(language: Language): boolean {
  const rtl = isRTLLanguage(language);

  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
    }
    return false;
  }

  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

/** Langue active de l'interface. */
export function useLanguage(): Language {
  const { i18n: instance } = useTranslation();
  const lang = instance.language;
  return lang === 'ar' || lang === 'en' ? lang : 'fr';
}

/** true si l'interface est en arabe (droite→gauche). */
export function useIsRTL(): boolean {
  return isRTLLanguage(useLanguage());
}

export default i18n;
