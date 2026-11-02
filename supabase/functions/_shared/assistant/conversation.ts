/**
 * Boucle de conversation avec l'API Claude (appels d'outils exécutés ici, sur
 * le serveur). La fonction d'appel au modèle est injectée : la vraie en
 * production, une fausse dans les tests.
 */
import type Anthropic from 'npm:@anthropic-ai/sdk@1';

import type { ChatTurn } from './request.ts';
import { runTool, TOOL_DEFINITIONS, type ToolContext } from './tools.ts';

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

export type CreateMessage = (params: Params) => Promise<Message>;

export type ConversationResult =
  | { kind: 'answer'; text: string; truncated: boolean }
  | { kind: 'refused' }
  | { kind: 'failed'; reason: 'empty' | 'too_many_steps' };

export type Usage = { input: number; output: number };

/** Nombre maximal d'allers-retours avec le modèle pour une question. */
export const MAX_STEPS = 6;

/**
 * Après un relais vers un modèle de secours en cours de réponse, les blocs
 * internes (réflexion, appels d'outils) produits AVANT le dernier bloc
 * « fallback » ne doivent pas être renvoyés.
 */
export function echoable(content: ContentBlock[]): ContentBlock[] {
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  if (lastFallback < 0) return content;
  const internal = new Set(['thinking', 'redacted_thinking', 'tool_use']);
  return content.filter((b, i) => i > lastFallback || !internal.has(b.type));
}

export async function runConversation(opts: {
  create: CreateMessage;
  model: string;
  systemPrompt: string;
  context: string;
  turns: ChatTurn[];
  tools: ToolContext;
}): Promise<{ result: ConversationResult; usage: Usage; steps: number }> {
  const usage: Usage = { input: 0, output: 0 };
  // Historique : texte seul des échanges précédents (aucun bloc de réflexion
  // n'est conservé d'une question à l'autre) ; pendant une question, les
  // réponses du modèle sont ajoutées telles quelles, sans jamais être modifiées.
  const messages: MessageParam[] = opts.turns.map((t) => ({ role: t.role, content: t.text }));

  for (let step = 1; step <= MAX_STEPS; step++) {
    const response = await opts.create({
      model: opts.model,
      max_tokens: 16000,
      // Consignes fixes mises en cache ; le contexte du jour vient après.
      system: [
        { type: 'text', text: opts.systemPrompt, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: opts.context },
      ],
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Beta.Messages.BetaTool[],
      messages,
      // Questions simples de la vie courante : effort de réflexion bas (rapide, moins cher).
      output_config: { effort: 'low' },
      // Si le modèle principal décline, l'API relance la demande sur un modèle de secours.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    const u = response.usage;
    usage.input += (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    usage.output += u.output_tokens ?? 0;

    if (response.stop_reason === 'refusal') return { result: { kind: 'refused' }, usage, steps: step };

    if (response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: echoable(response.content) });
      if (response.stop_reason === 'pause_turn') continue;
      const calls = response.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use');
      // Tous les résultats dans UN seul message, dans l'ordre des appels.
      const results = await Promise.all(calls.map((c) => runTool(c.name, c.input, opts.tools)));
      messages.push({
        role: 'user',
        content: calls.map((c, i) => ({
          type: 'tool_result' as const,
          tool_use_id: c.id,
          content: results[i]!.content,
          ...(results[i]!.isError ? { is_error: true } : {}),
        })),
      });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) return { result: { kind: 'failed', reason: 'empty' }, usage, steps: step };
    return { result: { kind: 'answer', text, truncated: response.stop_reason === 'max_tokens' }, usage, steps: step };
  }
  return { result: { kind: 'failed', reason: 'too_many_steps' }, usage, steps: MAX_STEPS };
}
