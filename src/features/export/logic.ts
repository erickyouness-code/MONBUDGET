/**
 * Export des données (pur, testé).
 * - CSV : transactions, lisible dans Excel / Google Sheets (séparateur et virgule
 *   décimale adaptés à la langue, BOM UTF-8 pour les accents et l'arabe).
 * - JSON : toutes les données du compte (portabilité).
 */
import { CURRENCIES, type CurrencyCode } from '@/shared/config/currencies';
import type { Language } from '@/shared/i18n/languages';

export type CsvFormat = { separator: ';' | ','; decimal: ',' | '.' };

/** En français et en arabe, Excel attend « ; » et la virgule décimale. */
export function csvFormatFor(language: Language): CsvFormat {
  return language === 'en' ? { separator: ',', decimal: '.' } : { separator: ';', decimal: ',' };
}

/**
 * Une cellule CSV sûre : guillemets doublés, et neutralisation des formules
 * (une description commençant par « = » ne doit jamais s'exécuter dans Excel).
 */
export function csvCell(value: string | number | null | undefined, separator: string): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Un nombre signé (« -45,50 ») reste un nombre ; tout le reste commençant par = + - @ est neutralisé.
  const isNumber = /^[+-]?\d+([.,]\d+)?$/.test(text);
  if (typeof value === 'string' && !isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (text.includes(separator) || /["\r\n]/.test(text) || text !== text.trim()) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: (string | number | null)[][], format: CsvFormat): string {
  return '﻿' + rows.map((r) => r.map((c) => csvCell(c, format.separator)).join(format.separator)).join('\r\n') + '\r\n';
}

/** Montant en unités principales, sans séparateur de milliers ("-1250,50"). */
export function plainAmount(minor: number, currency: CurrencyCode, decimal: CsvFormat['decimal']): string {
  const decimals = CURRENCIES[currency].decimals;
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor).toString().padStart(decimals + 1, '0');
  return decimals ? `${sign}${abs.slice(0, -decimals)}${decimal}${abs.slice(-decimals)}` : `${sign}${abs}`;
}

export type ExportTransaction = {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  amount_minor: number;
  occurred_on: string;
  category_id: string | null;
  account_id: string;
  to_account_id: string | null;
  payment_method: string | null;
  description: string | null;
};

export type CsvLabels = {
  headers: [string, string, string, string, string, string, string, string, string];
  type: (type: ExportTransaction['type']) => string;
  category: (id: string | null) => string;
  account: (id: string | null) => string;
  payment: (method: string | null) => string;
};

/**
 * Lignes du CSV, de la plus ancienne à la plus récente. Le montant est signé
 * (dépense négative) pour que la somme d'une colonne donne le solde des
 * mouvements ; un transfert reste positif (il ne change pas le total).
 */
export function transactionsCsv(rows: ExportTransaction[], currency: CurrencyCode, language: Language, labels: CsvLabels): string {
  const format = csvFormatFor(language);
  const sorted = [...rows].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id));
  const body = sorted.map((t) => [
    t.occurred_on,
    labels.type(t.type),
    plainAmount(t.type === 'expense' ? -t.amount_minor : t.amount_minor, currency, format.decimal),
    currency,
    t.type === 'transfer' ? '' : labels.category(t.category_id),
    labels.account(t.account_id),
    t.to_account_id ? labels.account(t.to_account_id) : '',
    labels.payment(t.payment_method),
    t.description ?? '',
  ]);
  return toCsv([labels.headers, ...body], format);
}

export function exportFileName(kind: 'transactions' | 'data', today: string, extension: 'csv' | 'json'): string {
  return `monbudget-${kind}-${today}.${extension}`;
}

/** Fichier JSON complet, avec une en-tête décrivant le format. */
export function dataJson(tables: Record<string, unknown[]>, meta: { exportedAt: string; currency: CurrencyCode | null }): string {
  return JSON.stringify(
    {
      app: 'MonBudget',
      format_version: 1,
      exported_at: meta.exportedAt,
      currency: meta.currency,
      note: 'Amounts are integers in the smallest currency unit (MAD: centimes, XAF: francs).',
      ...tables,
    },
    null,
    2,
  );
}
