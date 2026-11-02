import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import { categoryLabel } from '@/features/categories/meta';
import type { Category } from '@/features/transactions/types';
import type { CurrencyCode } from '@/shared/config/currencies';
import type { Language } from '@/shared/i18n/languages';
import { supabase } from '@/shared/lib/supabase';

import { dataJson, exportFileName, transactionsCsv, type ExportTransaction } from './logic';

const PAGE = 1000;

/** Lit toute une table (par pages), uniquement les lignes de l'utilisateur (RLS). */
async function readAll<T>(table: string, columns = '*', orderBy = 'id'): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Enregistre le fichier puis ouvre le partage (téléphone) ou le téléchargement (web). */
async function deliver(name: string, content: string, mimeType: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  // Fichier temporaire (cache) : le système peut le supprimer, rien n'est conservé.
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing_unavailable');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json' });
}

export async function exportTransactionsCsv(opts: { currency: CurrencyCode; language: Language; today: string; t: TFunction }): Promise<number> {
  const { t } = opts;
  const [transactions, categories, accounts] = await Promise.all([
    readAll<ExportTransaction>('transactions', 'id, type, amount_minor, occurred_on, category_id, account_id, to_account_id, payment_method, description'),
    readAll<Category>('categories'),
    readAll<{ id: string; name: string }>('accounts', 'id, name'),
  ]);
  const cats = new Map(categories.map((c) => [c.id, c]));
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const csv = transactionsCsv(transactions.map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })), opts.currency, opts.language, {
    headers: [
      t('data.csv.date'),
      t('data.csv.type'),
      t('data.csv.amount'),
      t('data.csv.currency'),
      t('data.csv.category'),
      t('data.csv.account'),
      t('data.csv.toAccount'),
      t('data.csv.payment'),
      t('data.csv.description'),
    ],
    type: (type) => t(`data.csv.types.${type}`),
    category: (id) => (id ? categoryLabel(cats.get(id), t) : t('data.csv.uncategorized')),
    account: (id) => (id ? (accountNames.get(id) ?? '') : ''),
    payment: (method) => (method ? t(`paymentMethods.${method as 'cash'}`) : ''),
  });
  await deliver(exportFileName('transactions', opts.today, 'csv'), csv, 'text/csv', t('data.exportCsv'));
  return transactions.length;
}

const TABLES = ['profiles', 'accounts', 'categories', 'transactions', 'budgets', 'savings_goals', 'goal_contributions', 'scheduled_items', 'scheduled_completions', 'entitlements'] as const;

export async function exportAllJson(opts: { currency: CurrencyCode | null; today: string; dialogTitle: string }): Promise<void> {
  const results = await Promise.all(TABLES.map((table) => readAll<Record<string, unknown>>(table, '*', table === 'entitlements' ? 'user_id' : 'id')));
  const tables = Object.fromEntries(
    TABLES.map((table, i) => [
      table,
      // Seules les catégories personnelles : les catégories système sont communes à tous.
      table === 'categories' ? results[i]!.filter((c) => c.user_id !== null) : results[i]!,
    ]),
  );
  await deliver(exportFileName('data', opts.today, 'json'), dataJson(tables, { exportedAt: new Date().toISOString(), currency: opts.currency }), 'application/json', opts.dialogTitle);
}

export type DeleteResult = { ok: true } | { ok: false; code: 'wrong_password' | 'network' | 'generic' };

/** Suppression définitive : tout est vérifié et exécuté par le serveur. */
export async function deleteMyAccount(password: string): Promise<DeleteResult> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: { password, confirm: 'DELETE' } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await (error.context as Response).json().catch(() => null)) as { code?: string } | null;
      return { ok: false, code: body?.code === 'wrong_password' ? 'wrong_password' : 'generic' };
    }
    return { ok: false, code: error instanceof FunctionsFetchError ? 'network' : 'generic' };
  }
  return (data as { deleted?: boolean } | null)?.deleted ? { ok: true } : { ok: false, code: 'generic' };
}
