import type { Language } from '../i18n/languages';

/** Locales utilisées pour les dates. ar-MA : mois en arabe, chiffres latins. */
const DATE_LOCALES: Record<Language, string> = { fr: 'fr-FR', ar: 'ar-MA', en: 'en-GB' };

/** Mois au format "AAAA-MM". */
export type YearMonth = string;

export function toYearMonth(date: Date): YearMonth {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Les `count` derniers mois, du plus ancien au mois en cours. */
export function lastMonths(count: number, now = new Date()): YearMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return toYearMonth(d);
  });
}

function parseYearMonth(ym: YearMonth): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, 1);
}

function safeFormat(date: Date, language: Language, options: Intl.DateTimeFormatOptions, fallback: string): string {
  try {
    return new Intl.DateTimeFormat(DATE_LOCALES[language], options).format(date);
  } catch {
    return fallback;
  }
}

/** "nov.", "Nov", "نونبر" */
export function formatMonthShort(ym: YearMonth, language: Language): string {
  const label = safeFormat(parseYearMonth(ym), language, { month: 'short' }, ym.slice(5));
  return label.charAt(0).toUpperCase() + label.slice(1).replace(/\.$/, '');
}

/** "Novembre 2026" */
export function formatMonthLong(date: Date, language: Language): string {
  const label = safeFormat(date, language, { month: 'long', year: 'numeric' }, toYearMonth(date));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "3 nov." */
export function formatDayShort(isoDate: string, language: Language): string {
  const date = new Date(`${isoDate}T12:00:00`);
  return safeFormat(date, language, { day: 'numeric', month: 'short' }, isoDate);
}
