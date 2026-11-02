import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { Category, CategoryKind } from '@/features/transactions/types';
import { supabase } from '@/shared/lib/supabase';

export const categoriesKey = ['categories'] as const;

/** Catégories du système + celles créées par l'utilisateur. */
export function useCategories() {
  const { session } = useAuth();
  return useQuery({
    queryKey: categoriesKey,
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, user_id, kind, key, name, icon, color, sort_order, is_archived')
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useCreateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: CategoryKind; name: string }): Promise<Category> => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ kind: input.kind, name: input.name.trim(), icon: 'tag', sort_order: 500 })
        .select('id, user_id, kind, key, name, icon, color, sort_order, is_archived')
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: categoriesKey }),
  });
}
