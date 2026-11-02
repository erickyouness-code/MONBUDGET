import { reloadAppAsync } from 'expo';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { flushPreferences, usePreferences } from '../store/preferences';
import { applyLayoutDirection, deviceLanguageCode } from './index';
import { resolveLanguage, type Language } from './languages';

/**
 * Change la langue. Si le sens d'écriture change (ex. français → arabe),
 * on prévient l'utilisateur puis on redémarre l'application.
 */
export function useChangeLanguage() {
  const { i18n, t } = useTranslation();
  const setLanguage = usePreferences((s) => s.setLanguage);

  return useCallback(
    async (choice: Language | null): Promise<Language> => {
      setLanguage(choice);
      const language = resolveLanguage(choice, deviceLanguageCode());
      await i18n.changeLanguage(language);

      if (!applyLayoutDirection(language)) return language;

      await flushPreferences();
      Alert.alert(t('settings.restartTitle'), t('settings.restartMessage'), [
        { text: t('settings.restartConfirm'), onPress: () => void reloadAppAsync() },
      ]);
      return language;
    },
    [i18n, setLanguage, t],
  );
}
