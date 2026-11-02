/**
 * Assistant : règles côté application (pures, testées).
 * La conversation reste sur le téléphone, en mémoire : elle n'est enregistrée
 * nulle part et disparaît à la fermeture de l'application ou à la déconnexion.
 */

export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { id: string; role: ChatRole; text: string };

/** Mêmes limites que le serveur (supabase/functions/_shared/assistant/request.ts). */
export const MAX_QUESTION_LENGTH = 1000;
const MAX_TURNS_SENT = 12;
const MAX_ASSISTANT_LENGTH = 4000;

/** Historique envoyé au serveur : les derniers échanges, en texte seul. */
export function historyForRequest(messages: ChatMessage[]): { role: ChatRole; text: string }[] {
  return messages.slice(-MAX_TURNS_SENT).map((m) => ({
    role: m.role,
    text: m.role === 'assistant' ? m.text.slice(0, MAX_ASSISTANT_LENGTH) : m.text,
  }));
}

/** Codes d'erreur renvoyés par la fonction serveur « assistant ». */
export type AssistantErrorCode =
  | 'premium_required'
  | 'consent_required'
  | 'daily_limit'
  | 'rate_limit'
  | 'busy'
  | 'not_configured'
  | 'refused'
  | 'network'
  | 'generic';

const KNOWN: AssistantErrorCode[] = ['premium_required', 'consent_required', 'daily_limit', 'rate_limit', 'busy', 'not_configured', 'refused'];

export function errorCodeOf(code: unknown): AssistantErrorCode {
  return KNOWN.includes(code as AssistantErrorCode) ? (code as AssistantErrorCode) : 'generic';
}

/** Une nouvelle tentative a-t-elle un sens ? (pas pour une limite du jour ou un refus) */
export function canRetry(code: AssistantErrorCode): boolean {
  return code === 'busy' || code === 'network' || code === 'generic' || code === 'rate_limit';
}

export const SUGGESTIONS = ['spentWeek', 'topCategory', 'afford', 'saveGoal', 'tips', 'upcoming'] as const;
export type SuggestionKey = (typeof SUGGESTIONS)[number];

/** Montant d'exemple adapté à la devise, pour la question « Puis-je acheter… ». */
export function exampleAmount(currency: 'MAD' | 'XAF'): number {
  return currency === 'XAF' ? 15_000_000 : 300_000; // 150 000 FCFA ; 3 000 DH (en plus petite unité)
}

/**
 * Empêche un retour à la ligne au milieu d'un montant (« 2 100 DH ») :
 * espaces insécables entre groupes de chiffres et avant le symbole.
 */
export function keepAmountsTogether(text: string): string {
  return text
    .replace(/(\d) (?=\d{3}(?!\d))/g, '$1\u202F')
    .replace(/(\d) (?=(DH|FCFA|MAD|XAF|د\.م\.))/g, '$1\u00A0');
}
