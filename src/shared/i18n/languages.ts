export type Language = 'fr' | 'ar' | 'en';

export const LANGUAGES: Language[] = ['fr', 'ar', 'en'];

/** Nom de chaque langue écrit dans cette langue (pour le sélecteur). */
export const LANGUAGE_NATIVE_NAMES: Record<Language, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

export const RTL_LANGUAGES = new Set<Language>(['ar']);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as string[]).includes(value);
}

/** Langue utilisée si l'utilisateur n'a rien choisi : celle du téléphone, sinon le français. */
export function resolveLanguage(choice: Language | null, deviceLanguageCode: string | null | undefined): Language {
  if (choice) return choice;
  return isLanguage(deviceLanguageCode) ? deviceLanguageCode : 'fr';
}
