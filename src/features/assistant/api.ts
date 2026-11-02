import { useMutation } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { useProfile, useUpdateProfile } from '@/features/profile/api';
import type { Language } from '@/shared/i18n/languages';
import { supabase } from '@/shared/lib/supabase';

import { errorCodeOf, historyForRequest, type AssistantErrorCode, type ChatMessage } from './logic';

export type AssistantReply = { ok: true; reply: string; truncated: boolean } | { ok: false; code: AssistantErrorCode };

/**
 * Pose la question au serveur. Toutes les vérifications (connexion, abonnement,
 * accord, quota) et tous les calculs sont faits côté serveur.
 */
export async function askAssistant(messages: ChatMessage[], language: Language): Promise<AssistantReply> {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { messages: historyForRequest(messages), language },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await (error.context as Response).json().catch(() => null)) as { code?: unknown } | null;
      return { ok: false, code: errorCodeOf(body?.code) };
    }
    return { ok: false, code: error instanceof FunctionsFetchError ? 'network' : 'generic' };
  }
  const body = data as { reply?: unknown; truncated?: unknown; code?: unknown } | null;
  if (typeof body?.reply === 'string' && body.reply.trim()) return { ok: true, reply: body.reply, truncated: body.truncated === true };
  return { ok: false, code: errorCodeOf(body?.code) };
}

export function useAskAssistant() {
  return useMutation({ mutationFn: ({ messages, language }: { messages: ChatMessage[]; language: Language }) => askAssistant(messages, language) });
}

/** Accord de l'utilisateur pour que l'assistant consulte ses données (enregistré dans son profil). */
export function useAssistantConsent() {
  const profile = useProfile();
  const update = useUpdateProfile();
  return {
    loading: profile.isPending,
    granted: !!profile.data?.assistant_consent_at,
    saving: update.isPending,
    failed: update.isError,
    setGranted: (granted: boolean) => update.mutateAsync({ assistant_consent_at: granted ? new Date().toISOString() : null }),
  };
}
