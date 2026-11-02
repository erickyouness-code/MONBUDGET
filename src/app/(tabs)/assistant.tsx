import { useQueryClient } from '@tanstack/react-query';
import { Info, SquarePen } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAskAssistant, useAssistantConsent } from '@/features/assistant/api';
import { Bubble, Composer, ConsentCard, Suggestions, ThinkingBubble } from '@/features/assistant/components';
import { canRetry, exampleAmount, SUGGESTIONS, type AssistantErrorCode, type ChatMessage } from '@/features/assistant/logic';
import { useCurrency } from '@/features/profile/api';
import { entitlementKey } from '@/features/subscription/api';
import { useLanguage } from '@/shared/i18n';
import { formatMoneyCompact } from '@/shared/lib/money';
import { usePreferences } from '@/shared/store/preferences';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button } from '@/shared/ui';

let nextId = 0;
const newId = () => `m${Date.now()}-${++nextId}`;

/**
 * Assistant financier. La conversation reste en mémoire sur le téléphone ;
 * chaque question est traitée par le serveur (abonnement, accord, quota et
 * calculs vérifiés côté serveur).
 */
export default function AssistantScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const currency = useCurrency();
  const demoMode = usePreferences((s) => s.demoMode);
  const consent = useAssistantConsent();
  const ask = useAskAssistant();
  const queryClient = useQueryClient();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<AssistantErrorCode | null>(null);

  const run = async (history: ChatMessage[]) => {
    setError(null);
    const result = await ask.mutateAsync({ messages: history, language });
    if (result.ok) {
      const text = result.truncated ? `${result.reply}\n\n${t('assistant.truncated')}` : result.reply;
      setMessages((m) => [...m, { id: newId(), role: 'assistant', text }]);
      return;
    }
    setError(result.code);
    // Le serveur fait foi : on resynchronise l'accord ou l'abonnement affichés.
    if (result.code === 'premium_required') void queryClient.invalidateQueries({ queryKey: entitlementKey });
    if (result.code === 'consent_required') void queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const send = (text: string) => {
    if (ask.isPending) return;
    const history = [...messages, { id: newId(), role: 'user' as const, text }];
    setMessages(history);
    void run(history);
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  const suggestions = SUGGESTIONS.map((key) =>
    t(`assistant.suggestions.${key}`, { amount: formatMoneyCompact(exampleAmount(currency), currency, language) }),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="title" accessibilityRole="header">
            {t('assistant.title')}
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {t('assistant.subtitle')}
          </AppText>
        </View>
        {messages.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('assistant.newChat')}
            disabled={ask.isPending}
            onPress={reset}
            hitSlop={8}
            style={({ pressed }) => ({ padding: spacing.sm, borderRadius: 20, backgroundColor: pressed ? colors.primarySoft : 'transparent', opacity: ask.isPending ? 0.4 : 1 })}
          >
            <SquarePen size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {demoMode ? <Banner tone="info" message={t('assistant.demoNotice')} /> : null}

          {consent.loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : !consent.granted ? (
            <>
              {consent.failed ? <Banner tone="error" message={t('errors.saveFailed')} /> : null}
              <ConsentCard saving={consent.saving} onAccept={() => void consent.setGranted(true).then(() => setError(null)).catch(() => undefined)} />
            </>
          ) : messages.length === 0 ? (
            <View style={{ gap: spacing.lg }}>
              <AppText variant="body" color="textSecondary">
                {t('assistant.emptyMessage')}
              </AppText>
              <Suggestions items={suggestions} onPick={send} disabled={ask.isPending} />
            </View>
          ) : (
            <View testID="chat-log" style={{ gap: spacing.md }}>
              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
              {ask.isPending ? <ThinkingBubble /> : null}
            </View>
          )}

          {error && consent.granted ? (
            <View style={{ gap: spacing.sm }}>
              <Banner tone={error === 'refused' ? 'info' : 'error'} message={t(`assistant.errors.${error}`)} />
              {canRetry(error) && messages.at(-1)?.role === 'user' ? (
                <Button label={t('assistant.retry')} variant="secondary" loading={ask.isPending} onPress={() => void run(messages)} />
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: 'auto', paddingTop: spacing.md }}>
            <Info size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
            <AppText variant="small" color="textTertiary" style={{ flex: 1 }}>
              {t('assistant.disclaimer')}
            </AppText>
          </View>
        </ScrollView>

        {consent.granted ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.background }}>
            <Composer onSend={send} busy={ask.isPending} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
