import type { Language } from '../i18n/languages';

/**
 * Devises prises en charge.
 * `decimals` = nombre de chiffres après la virgule.
 * Les montants sont TOUJOURS stockés en entiers dans la plus petite unité
 * (centimes pour le dirham, francs pour le FCFA) pour éviter les erreurs d'arrondi.
 */
export type CurrencyCode = 'MAD' | 'XAF';

export type CurrencyConfig = {
  code: CurrencyCode;
  decimals: number;
  symbol: Record<Language, string>;
};

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  MAD: { code: 'MAD', decimals: 2, symbol: { fr: 'DH', en: 'DH', ar: 'د.م.' } },
  XAF: { code: 'XAF', decimals: 0, symbol: { fr: 'FCFA', en: 'FCFA', ar: 'FCFA' } },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
