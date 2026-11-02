/**
 * Lecture des données pour l'assistant, avec le jeton de l'utilisateur :
 * les règles RLS de la base garantissent qu'il ne lit QUE ses propres données.
 * Lecture seule : aucun outil de l'assistant ne peut modifier quoi que ce soit.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { Completion, ScheduledItem } from '../app/schedule-logic.ts';
import type { CategoryLike } from './categories.ts';
import type { Range } from './periods.ts';
import type { AccountRow, AssistantData, BudgetRow, GoalRow, TxRow } from './tools.ts';

const PAGE = 1000; // limite par requête de l'API Supabase
const MAX_ROWS = 5000; // plafond par période (protège le serveur et les coûts)

function check<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return (result.data ?? []) as T;
}

/** Mémorise chaque lecture le temps d'une question (plusieurs outils lisent les mêmes données). */
function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => (cached ??= fn());
}

export function supabaseData(db: SupabaseClient): AssistantData {
  const txCache = new Map<string, Promise<{ rows: TxRow[]; truncated: boolean }>>();

  const accounts = memo(async (): Promise<AccountRow[]> => {
    const [list, balances] = await Promise.all([
      db.from('accounts').select('id, name, type, is_archived').order('created_at'),
      db.from('account_balances').select('account_id, balance_minor'),
    ]);
    const byId = new Map(check<{ account_id: string; balance_minor: number }[]>(balances).map((b) => [b.account_id, Number(b.balance_minor)]));
    return check<Omit<AccountRow, 'balance_minor'>[]>(list).map((a) => ({ ...a, balance_minor: byId.get(a.id) ?? 0 }));
  });

  const categories = memo(async (): Promise<CategoryLike[]> =>
    check<CategoryLike[]>(await db.from('categories').select('id, key, name, kind')),
  );

  const goals = memo(async (): Promise<GoalRow[]> => {
    const [list, progress] = await Promise.all([
      db.from('savings_goals').select('id, name, target_minor, target_date, created_at, is_archived'),
      db.from('goal_progress').select('goal_id, saved_minor, saved_last_90_minor'),
    ]);
    const byId = new Map(check<{ goal_id: string; saved_minor: number; saved_last_90_minor: number }[]>(progress).map((p) => [p.goal_id, p]));
    return check<{ id: string; name: string; target_minor: number; target_date: string | null; created_at: string; is_archived: boolean }[]>(list).map((g) => ({
      id: g.id,
      name: g.name,
      target_minor: Number(g.target_minor),
      target_date: g.target_date,
      created_on: g.created_at.slice(0, 10),
      is_archived: g.is_archived,
      saved_minor: Number(byId.get(g.id)?.saved_minor ?? 0),
      saved_last_90_minor: Number(byId.get(g.id)?.saved_last_90_minor ?? 0),
    }));
  });

  const schedule = memo(async () => {
    const [items, completions] = await Promise.all([
      db
        .from('scheduled_items')
        .select('id, kind, title, amount_minor, category_id, account_id, frequency, interval_count, start_date, end_date, remind_days_before, is_active, note'),
      db.from('scheduled_completions').select('id, item_id, due_on, status, transaction_id'),
    ]);
    return {
      items: check<ScheduledItem[]>(items).map((i) => ({ ...i, amount_minor: i.amount_minor === null ? null : Number(i.amount_minor) })),
      completions: check<Completion[]>(completions),
    };
  });

  return {
    accounts,
    categories,
    goals,
    schedule,
    async budgets(month: string): Promise<BudgetRow[]> {
      const rows = check<BudgetRow[]>(await db.rpc('budget_status', { p_month: month }));
      return rows.map((r) => ({ ...r, limit_minor: Number(r.limit_minor), spent_minor: Number(r.spent_minor) }));
    },
    transactions(range: Range) {
      const key = `${range.start}|${range.end}`;
      let pending = txCache.get(key);
      if (!pending) {
        pending = (async () => {
          const rows: TxRow[] = [];
          for (let from = 0; from < MAX_ROWS; from += PAGE) {
            const page = check<TxRow[]>(
              await db
                .from('transactions')
                .select('id, type, amount_minor, occurred_on, category_id, account_id, to_account_id, description')
                .gte('occurred_on', range.start)
                .lte('occurred_on', range.end)
                .order('occurred_on', { ascending: false })
                .order('id')
                .range(from, from + PAGE - 1),
            );
            rows.push(...page.map((r) => ({ ...r, amount_minor: Number(r.amount_minor) })));
            if (page.length < PAGE) return { rows, truncated: false };
          }
          return { rows, truncated: true };
        })();
        txCache.set(key, pending);
      }
      return pending;
    },
  };
}
