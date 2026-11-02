import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { defaultCurrencyForRegion } from '../config/countries';
import type { CurrencyCode } from '../config/currencies';
import type { Language } from '../i18n/languages';

/**
 * Préférences d'affichage stockées sur l'appareil (aucune donnée financière ici).
 * À partir de l'étape 1, la devise et la langue seront aussi enregistrées dans
 * le profil Supabase pour être retrouvées sur un autre téléphone.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

type PreferencesState = {
  theme: ThemePreference;
  /** null = suivre la langue du téléphone. */
  language: Language | null;
  currency: CurrencyCode;
  /** Affiche des données d'exemple clairement signalées (jamais enregistrées). */
  demoMode: boolean;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Language | null) => void;
  setCurrency: (currency: CurrencyCode) => void;
  setDemoMode: (demoMode: boolean) => void;
};

// On garde la dernière écriture pour pouvoir l'attendre avant un redémarrage.
let lastWrite: Promise<void> = Promise.resolve();

const trackedStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => {
    lastWrite = AsyncStorage.setItem(name, value);
    return lastWrite;
  },
  removeItem: (name) => AsyncStorage.removeItem(name),
};

/** Attend que les préférences soient bien écrites sur le disque. */
export function flushPreferences(): Promise<void> {
  return lastWrite;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: null,
      currency: defaultCurrencyForRegion(getLocales()[0]?.regionCode),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      demoMode: false,
      setCurrency: (currency) => set({ currency }),
      setDemoMode: (demoMode) => set({ demoMode }),
    }),
    {
      name: 'monbudget.preferences',
      version: 1,
      storage: createJSONStorage(() => trackedStorage),
      partialize: ({ theme, language, currency, demoMode }) => ({ theme, language, currency, demoMode }),
    },
  ),
);
