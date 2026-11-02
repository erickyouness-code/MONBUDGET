/**
 * Vérification de la requête envoyée par l'application.
 * L'historique de conversation reste sur le téléphone ; il est renvoyé à
 * chaque question (texte seul), borné en taille pour maîtriser les coûts.
 */
import type { Lang } from './format.ts';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export const LIMITS = {
  maxTurnsReceived: 40,
  maxTurnsKept: 12,
  maxUserChars: 1000,
  maxAssistantChars: 4000,
} as const;

export function parseRequest(body: unknown): { turns: ChatTurn[]; language: Lang | null } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'invalid body' };
  const { messages, language } = body as { messages?: unknown; language?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) return { error: 'messages required' };
  if (messages.length > LIMITS.maxTurnsReceived) return { error: 'conversation too long' };

  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') return { error: 'invalid message' };
    const { role, text } = m as { role?: unknown; text?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string') return { error: 'invalid message' };
    const trimmed = text.trim();
    if (!trimmed) continue;
    const max = role === 'user' ? LIMITS.maxUserChars : LIMITS.maxAssistantChars;
    if (trimmed.length > max) return { error: 'message too long' };
    turns.push({ role, text: trimmed });
  }
  if (turns.at(-1)?.role !== 'user') return { error: 'last message must come from the user' };

  // On garde les derniers échanges, en commençant par une question.
  let kept = turns.slice(-LIMITS.maxTurnsKept);
  while (kept.length && kept[0]!.role !== 'user') kept = kept.slice(1);
  // Deux messages consécutifs du même rôle sont fusionnés.
  const merged: ChatTurn[] = [];
  for (const t of kept) {
    const last = merged.at(-1);
    if (last && last.role === t.role) last.text += `\n\n${t.text}`;
    else merged.push({ ...t });
  }
  return { turns: merged, language: language === 'fr' || language === 'ar' || language === 'en' ? language : null };
}
