import { CURRENCIES, type CurrencyCode } from '../config/currencies';
import type { Language } from '../i18n/languages';

/**
 * Outils de manipulation de l'argent.
 *
 * Règle d'or : un montant est un ENTIER dans la plus petite unité de la devise
 * (ex. 125050 = 1 250,50 DH ; 12500 = 12 500 FCFA). On ne passe jamais par des
 * nombres à virgule, qui provoquent des erreurs d'arrondi (0,1 + 0,2 ≠ 0,3).
 *
 * Le formatage est fait à la main (et non via Intl) pour obtenir exactement le
 * même rendu sur iOS, Android et le web, quelle que soit la version du moteur JS.
 */

type Separators = { group: string; decimal: string };

const NARROW_NBSP = ' '; // espace fine insécable (norme française)
const NBSP = ' ';
const MINUS = '−'; // vrai signe moins, plus lisible que le tiret
const LRI = '⁦'; // isole le nombre pour qu'il ne soit jamais inversé en arabe
const PDI = '⁩';

const SEPARATORS: Record<Language, Separators> = {
  fr: { group: NARROW_NBSP, decimal: ',' },
  ar: { group: NARROW_NBSP, decimal: ',' }, // usage marocain, chiffres latins
  en: { group: ',', decimal: '.' },
};

export type SignDisplay = 'auto' | 'always' | 'never';

export type FormatMoneyOptions = {
  /** 'always' affiche aussi le + (utile pour les revenus). */
  signDisplay?: SignDisplay;
  /** Masque le symbole de la devise. */
  hideSymbol?: boolean;
};

function assertSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Montant invalide : ${value} doit être un entier.`);
  }
}

function groupDigits(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** Formate un montant (en plus petite unité) pour l'affichage. */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode,
  language: Language,
  options: FormatMoneyOptions = {},
): string {
  assertSafeInteger(amountMinor);
  const { decimals, symbol } = CURRENCIES[currency];
  const { group, decimal } = SEPARATORS[language];
  const { signDisplay = 'auto', hideSymbol = false } = options;

  const absolute = Math.abs(amountMinor).toString().padStart(decimals + 1, '0');
  const integerPart = decimals > 0 ? absolute.slice(0, -decimals) : absolute;
  const fractionPart = decimals > 0 ? absolute.slice(-decimals) : '';

  let number = groupDigits(integerPart, group);
  if (fractionPart) number += decimal + fractionPart;

  let sign = '';
  if (signDisplay !== 'never') {
    if (amountMinor < 0) sign = MINUS;
    else if (amountMinor > 0 && signDisplay === 'always') sign = '+';
  }

  const value = sign + number;
  const isolated = language === 'ar' ? LRI + value + PDI : value;
  return hideSymbol ? isolated : `${isolated}${NBSP}${symbol[language]}`;
}

/**
 * Convertit une saisie utilisateur ("1250,5", "1 250.50", "300") en entier
 * dans la plus petite unité. Retourne null si la saisie est invalide
 * (lettres, trop de décimales, nombre négatif, montant trop grand).
 */
export function parseAmountToMinor(input: string, currency: CurrencyCode): number | null {
  const { decimals } = CURRENCIES[currency];
  const cleaned = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d*)?$/.test(cleaned)) return null;

  const [integerPart, fractionPart = ''] = cleaned.split('.');
  if (fractionPart.length > decimals) return null;

  const minorString = integerPart + fractionPart.padEnd(decimals, '0');
  const minor = Number(minorString);
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) return null;
  return minor;
}

/** Plafond de sécurité : 1 000 milliards d'unités, largement suffisant. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_00;

/** Convertit en unités principales, arrondies à l'unité (pour les axes de graphiques). */
export function toMajorRounded(amountMinor: number, currency: CurrencyCode): number {
  return Math.round(amountMinor / 10 ** CURRENCIES[currency].decimals);
}

/** Nombre entier avec séparateur de milliers ("12 000"), sans symbole. */
export function formatPlainNumber(value: number, language: Language): string {
  const rounded = Math.round(value);
  const digits = groupDigits(Math.abs(rounded).toString(), SEPARATORS[language].group);
  return rounded < 0 ? MINUS + digits : digits;
}

/**
 * Comme formatMoney, mais sans les décimales nulles : "9 250 DH" au lieu de
 * "9 250,00 DH". Un montant avec des centimes reste exact ("345,75 DH").
 */
export function formatMoneyCompact(
  amountMinor: number,
  currency: CurrencyCode,
  language: Language,
  options: FormatMoneyOptions = {},
): string {
  const { decimals } = CURRENCIES[currency];
  const full = formatMoney(amountMinor, currency, language, options);
  if (decimals === 0 || amountMinor % 10 ** decimals !== 0) return full;
  return full.replace(`${SEPARATORS[language].decimal}${'0'.repeat(decimals)}`, '');
}
