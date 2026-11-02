import type { AccountType, PaymentMethod, Transaction } from './types';

/**
 * Règles métier pures (sans écran ni réseau), testées automatiquement.
 */

/** Effet d'une transaction sur le total « revenus − dépenses » : un transfert vaut 0. */
export function netEffect(tx: Pick<Transaction, 'type' | 'amount_minor'>): number {
  if (tx.type === 'income') return tx.amount_minor;
  if (tx.type === 'expense') return -tx.amount_minor;
  return 0;
}

/** Totaux d'une liste : les transferts ne comptent ni en revenus ni en dépenses. */
export function summarize(txs: Pick<Transaction, 'type' | 'amount_minor'>[]) {
  let incomeMinor = 0;
  let expensesMinor = 0;
  for (const tx of txs) {
    if (tx.type === 'income') incomeMinor += tx.amount_minor;
    else if (tx.type === 'expense') expensesMinor += tx.amount_minor;
  }
  return { incomeMinor, expensesMinor, netMinor: incomeMinor - expensesMinor };
}

export type DaySection<T> = { date: string; data: T[]; netMinor: number };

/** Regroupe par jour (liste déjà triée du plus récent au plus ancien). */
export function groupByDay<T extends Pick<Transaction, 'occurred_on' | 'type' | 'amount_minor'>>(txs: T[]): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const tx of txs) {
    let section = sections[sections.length - 1];
    if (!section || section.date !== tx.occurred_on) {
      section = { date: tx.occurred_on, data: [], netMinor: 0 };
      sections.push(section);
    }
    section.data.push(tx);
    section.netMinor += netEffect(tx);
  }
  return sections;
}

/** Moyen de paiement proposé selon le compte choisi (modifiable). */
export function defaultPaymentMethod(accountType: AccountType | undefined): PaymentMethod | null {
  switch (accountType) {
    case 'cash':
      return 'cash';
    case 'mobile_money':
      return 'mobile_money';
    case 'bank':
      return 'card';
    case 'savings':
      return 'bank_transfer';
    default:
      return null;
  }
}

/**
 * Prépare le texte recherché pour un filtre PostgREST `or(...)` :
 * neutralise les jokers SQL (% _) et les caractères qui casseraient la syntaxe.
 */
export function searchPattern(input: string): string | null {
  const trimmed = input.trim().slice(0, 60);
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

/** Date locale au format AAAA-MM-JJ (sans décalage de fuseau horaire). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
}

/** Premier et dernier jour du mois d'une date. */
export function monthRange(date = new Date()): { from: string; to: string } {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}
