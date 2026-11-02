import { ArrowUp, Lock, MessageSquareText, ShieldCheck, Sparkles, UserRound, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, TextInput, View, type TextStyle } from 'react-native';

import { useIsRTL } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card } from '@/shared/ui';

import { keepAmountsTogether, MAX_QUESTION_LENGTH, type ChatMessage } from './logic';

/** Écran d'accord : affiché tant que l'utilisateur n'a pas accepté. */
export function ConsentCard({ onAccept, saving }: { onAccept: () => void; saving: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const points: { icon: LucideIcon; text: string }[] = [
    { icon: ShieldCheck, text: t('assistant.consentPoint1') },
    { icon: MessageSquareText, text: t('assistant.consentPoint2') },
    { icon: Lock, text: t('assistant.consentPoint3') },
    { icon: UserRound, text: t('assistant.consentPoint4') },
  ];
  return (
    <Card style={{ gap: spacing.lg }}>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={26} color={colors.primary} />
        </View>
        <AppText variant="headline" align="center">
          {t('assistant.consentTitle')}
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {t('assistant.consentIntro')}
        </AppText>
      </View>
      <View style={{ gap: spacing.md }}>
        {points.map(({ icon: Icon, text }) => (
          <View key={text} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <Icon size={18} color={colors.primary} style={{ marginTop: 2 }} />
            <AppText variant="caption" style={{ flex: 1 }}>
              {text}
            </AppText>
          </View>
        ))}
      </View>
      <Button label={t('assistant.consentAccept')} fullWidth loading={saving} onPress={onAccept} />
    </Card>
  );
}

/** Une bulle de conversation (question à droite, réponse à gauche ; inversé en arabe). */
export function Bubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const mine = message.role === 'user';
  return (
    <View
      accessibilityLabel={`${mine ? t('assistant.you') : t('assistant.title')} : ${message.text}`}
      testID={mine ? 'bubble-user' : 'bubble-assistant'}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        backgroundColor: mine ? colors.primary : colors.surface,
        borderRadius: radius.lg,
        borderEndEndRadius: mine ? radius.sm : radius.lg,
        borderEndStartRadius: mine ? radius.lg : radius.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <AppText variant="body" selectable style={{ color: mine ? colors.onPrimary : colors.text }}>
        {keepAmountsTogether(message.text)}
      </AppText>
    </View>
  );
}

export function ThinkingBubble() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      <AppText variant="caption" color="textSecondary">
        {t('assistant.thinking')}
      </AppText>
    </View>
  );
}

/** Questions d'exemple, envoyées d'un appui. */
export function Suggestions({ items, onPick, disabled }: { items: string[]; onPick: (text: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="overline" color="textSecondary">
        {t('assistant.suggestionsTitle').toUpperCase()}
      </AppText>
      {items.map((text) => (
        <Pressable
          key={text}
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onPick(text)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: pressed ? colors.primarySoft : colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
          })}
        >
          <Sparkles size={16} color={colors.primary} />
          <AppText variant="body" style={{ flex: 1 }}>
            {text}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

// Supprime le contour bleu du navigateur.
const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

/** Zone de saisie de la question. */
export function Composer({ onSend, busy }: { onSend: (text: string) => void; busy: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing, radius, typography } = useTheme();
  const isRTL = useIsRTL();
  const [text, setText] = useState('');
  const ready = text.trim().length > 0 && !busy;
  const submit = () => {
    if (!ready) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: radius.lg,
        paddingStart: spacing.md,
        paddingEnd: spacing.xs,
        paddingVertical: spacing.xs,
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={t('assistant.placeholder')}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={t('assistant.placeholder')}
        multiline
        // Web : une seule ligne au départ (le champ grandit ensuite).
        {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
        maxLength={MAX_QUESTION_LENGTH}
        submitBehavior="blurAndSubmit"
        returnKeyType="send"
        onSubmitEditing={submit}
        style={[
          typography.body,
          { flex: 1, color: colors.text, maxHeight: 120, paddingVertical: spacing.sm, textAlign: isRTL ? 'right' : 'left' },
          webNoOutline,
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('assistant.send')}
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={submit}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: ready ? (pressed ? colors.primaryPressed : colors.primary) : colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <ArrowUp size={20} color={ready ? colors.onPrimary : colors.textTertiary} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}
