import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { CurrencyCode } from '@/shared/config/currencies';
import { supabase } from '@/shared/lib/supabase';

export type Goal = {
  id: string;
  name: string;
  icon: string;
  target_minor: number;
  target_date: string | null;
  currency_code: CurrencyCode;
  is_archived: boolean;
  created_at: string;
};

export type GoalWithProgress = Goal & {
  savedMinor: number;
  savedLast90Minor: number;
  lastContributionOn: string | null;
};

export type Contribution = {
  id: string;
  goal_id: string;
  amount_minor: number;
  occurred_on: string;
  note: string | null;
  is_initial: boolean;
  created_at: string;
};

export const goalsKey = ['goals'] as const;

const GOAL_COLUMNS = 'id, name, icon, target_minor, target_date, currency_code, is_archived, created_at';

/** Objectifs avec leur progression (calculée par la base). */
export function useGoals() {
  const { session } = useAuth();
  return useQuery({
    queryKey: goalsKey,
    enabled: !!session,
    queryFn: async (): Promise<GoalWithProgress[]> => {
      const [goals, progress] = await Promise.all([
        supabase.from('savings_goals').select(GOAL_COLUMNS).order('created_at'),
        supabase.from('goal_progress').select('goal_id, saved_minor, saved_last_90_minor, last_contribution_on'),
      ]);
      if (goals.error) throw goals.error;
      if (progress.error) throw progress.error;
      const byId = new Map((progress.data ?? []).map((p) => [p.goal_id as string, p]));
      return (goals.data as Goal[]).map((g) => {
        const p = byId.get(g.id);
        return {
          ...g,
          target_minor: Number(g.target_minor),
          savedMinor: Number(p?.saved_minor ?? 0),
          savedLast90Minor: Number(p?.saved_last_90_minor ?? 0),
          lastContributionOn: (p?.last_contribution_on as string | null) ?? null,
        };
      });
    },
  });
}

export function useGoalContributions(goalId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: [...goalsKey, goalId, 'contributions'],
    enabled: !!session && !!goalId,
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('goal_contributions')
        .select('id, goal_id, amount_minor, occurred_on, note, is_initial, created_at')
        .eq('goal_id', goalId!)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Contribution[]).map((c) => ({ ...c, amount_minor: Number(c.amount_minor) }));
    },
  });
}

/** Rafraîchit objectifs et versements, sans faire attendre l'écran. */
function useInvalidateGoals() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: goalsKey });
  };
}

export type GoalInput = {
  name: string;
  icon: string;
  target_minor: number;
  target_date: string | null;
  currency_code: CurrencyCode;
  /** Montant déjà épargné, à la création uniquement. */
  initialMinor?: number;
};

export function useSaveGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async ({ id, initialMinor, ...goal }: GoalInput & { id?: string }): Promise<string> => {
      if (id) {
        const { currency_code: _ignored, ...editable } = goal;
        const { error } = await supabase.from('savings_goals').update(editable).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from('savings_goals').insert(goal).select('id').single();
      if (error) throw error;
      const newId = (data as { id: string }).id;
      if (initialMinor && initialMinor > 0) {
        const { error: e2 } = await supabase
          .from('goal_contributions')
          .insert({ goal_id: newId, amount_minor: initialMinor, is_initial: true });
        if (e2) throw e2;
      }
      return newId;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useArchiveGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('savings_goals').update({ is_archived: archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Ajoute un versement (montant positif) ou un retrait (montant négatif). */
export function useAddContribution() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (input: { goalId: string; amountMinor: number; occurredOn: string; note: string | null }) => {
      const { error } = await supabase.from('goal_contributions').insert({
        goal_id: input.goalId,
        amount_minor: input.amountMinor,
        occurred_on: input.occurredOn,
        note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteContribution() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goal_contributions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Erreur « retrait supérieur au montant épargné » renvoyée par la base. */
export function isOverdrawError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23514';
}
