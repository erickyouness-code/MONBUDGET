/**
 * Montants pour l'assistant : entiers en plus petite unité (centimes pour le
 * dirham, francs pour le FCFA), formatés comme dans l'application.
 * L'IA reçoit des montants DÉJÀ formatés : elle ne fait aucun calcul.
 */
export type Currency = 'MAD' | 'XAF';
export type Lang = 'fr' | 'ar' | 'en';

export const DECIMALS: Record<Currency, number> = { MAD: 2, XAF: 0 };
export const SYMBOLS: Record<Currency, Record<Lang, string>> = {
  MAD: { fr: 'DH', en: 'DH', ar: 'د.م.' },
  XAF: { fr: 'FCFA', en: 'FCFA', ar: 'FCFA' },
};

/** Plafond de sécurité identique à l'application. */
export const MAX_AMOUNT_MINOR = 100_000_000_000_000;

const GROUP: Record<Lang, string> = { fr: ' ', ar: ' ', en: ',' };
const DECIMAL: Record<Lang, string> = { fr: ',', ar: ',', en: '.' };

/** "1 250,50 DH", "12 500 FCFA", "-300 DH". Les décimales nulles sont omises. */
export function formatAmount(minor: number, currency: Currency, lang: Lang): string {
  const decimals = DECIMALS[currency];
  const abs = Math.abs(Math.round(minor)).toString().padStart(decimals + 1, '0');
  const int = decimals > 0 ? abs.slice(0, -decimals) : abs;
  const frac = decimals > 0 ? abs.slice(-decimals) : '';
  let number = int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP[lang]);
  if (frac && !/^0+$/.test(frac)) number += DECIMAL[lang] + frac;
  return `${minor < 0 ? '-' : ''}${number} ${SYMBOLS[currency][lang]}`;
}

/** Montant donné par l'utilisateur (unités principales) → plus petite unité. Null si invalide. */
export function toMinor(major: unknown, currency: Currency): number | null {
  if (typeof major !== 'number' || !Number.isFinite(major) || major <= 0) return null;
  const minor = Math.round(major * 10 ** DECIMALS[currency]);
  return minor > 0 && minor <= MAX_AMOUNT_MINOR ? minor : null;
}

/** Arrondi vers le haut à l'unité de la devise (1 DH, 1 FCFA). */
export function ceilToUnit(minor: number, currency: Currency): number {
  const unit = 10 ** DECIMALS[currency];
  return Math.ceil(minor / unit) * unit;
}

/** Arrondi vers le bas à l'unité de la devise (montant « disponible par jour »). */
export function floorToUnit(minor: number, currency: Currency): number {
  const unit = 10 ** DECIMALS[currency];
  return Math.floor(minor / unit) * unit;
}

/** Pourcentage entier, ou null si la base est nulle. */
export function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}
