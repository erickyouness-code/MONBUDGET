import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import type { CountryCode } from '@/shared/config/countries';
import type { CurrencyCode } from '@/shared/config/currencies';
import type { Language } from '@/shared/i18n/languages';
import { supabase } from '@/shared/lib/supabase';
import { usePreferences } from '@/shared/store/preferences';

export type Profile = {
  id: string;
  display_name: string | null;
  country_code: CountryCode | null;
  currency_code: CurrencyCode | null;
  language: Language;
  onboarding_completed_at: string | null;
};

/** Champs que l'utilisateur a le droit de modifier (identiques aux droits SQL). */
export type ProfileUpdate = Partial<
  Pick<Profile, 'display_name' | 'country_code' | 'currency_code' | 'language' | 'onboarding_completed_at'>
>;

const COLUMNS = 'id, display_name, country_code, currency_code, language, onboarding_completed_at';

export const profileKey = (userId: string | undefined) => ['profile', userId] as const;

/** Profil de l'utilisateur connecté (null si non connecté). */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: profileKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId!).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

/** Modifie le profil, avec mise à jour immédiate de l'écran (annulée en cas d'échec). */
export function useUpdateProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  const key = profileKey(userId);

  return useMutation({
    mutationFn: async (patch: ProfileUpdate): Promise<Profile> => {
      if (!userId) throw new Error('Non connecté');
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select(COLUMNS).single();
      if (error) throw error;
      return data as Profile;
    },
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Profile>(key);
      if (previous) client.setQueryData<Profile>(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (profile) => client.setQueryData(key, profile),
  });
}

/** Devise à afficher : celle du profil, sinon la préférence locale. */
export function useCurrency(): CurrencyCode {
  const { data } = useProfile();
  const fallback = usePreferences((s) => s.currency);
  return data?.currency_code ?? fallback;
}
