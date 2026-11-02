import { router, useLocalSearchParams } from 'expo-router';
import { Check, Pencil, SkipForward, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAccounts } from '@/features/accounts/api';
import { ACCOUNT_ICONS } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useCompleteOccurrence, useCompletions, useScheduledItems, useUndoOccurrence } from '@/features/schedule/api';
import { isIncome } from '@/features/schedule/logic';
import { KindGlyph } from '@/features/schedule/meta';
import { toISODate } from '@/features/transactions/logic';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { formatDayShort } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Banner, Button, ChoiceChip, Screen } from '@/shared/ui';

/** Une échéance précise : la marquer payée / reçue, l'ignorer, ou annuler. */
export default function OccurrenceScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  const { itemId, due } = useLocalSearchParams<{ itemId: string; due: string }>();
  const currency = useCurrency();
  const items = useScheduledItems();
  const completions = useCompletions();
  const accounts = useAccounts();
  const complete = useCompleteOccurrence();
  const undo = useUndoOccurrence();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const item = items.data?.find((i) => i.id === itemId);
  if (!item) return <Screen safeTop={false}>{null}</Screen>;

  const completion = completions.data?.find((c) => c.item_id === itemId && c.due_on === due);
  const today = toISODate(new Date());
  const income = isIncome(item);
  const active = (accounts.data ?? []).filter((a) => !a.is_archived);
  const chosenAccount = accountId ?? item.account_id ?? active[0]?.id ?? null;
  const needsAccount = item.amount_minor !== null;
  const state = completion ? completion.status : due < today ? 'overdue' : due === today ? 'today' : 'upcoming';

  const run = async (status: 'paid' | 'skipped') => {
    setError(null);
    if (status === 'paid' && needsAccount && !chosenAccount) return setError(t('schedule.errors.accountRequired'));
    try {
      await complete.mutateAsync({ itemId: item.id, dueOn: due, status, accountId: status === 'paid' ? chosenAccount : null });
      router.back();
    } catch {
      setError(t('errors.saveFailed'));
    }
  };

  const cancel = async () => {
    if (!completion) return;
    const ok = await confirmAction({
      title: t('schedule.undoTitle'),
      message: completion.transaction_id ? t('schedule.undoMessageWithTx') : t('schedule.undoMessage'),
      confirmLabel: t('schedule.undo'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await undo.mutateAsync(completion.id);
    router.back();
  };

  const payLabel = item.kind === 'reminder' ? t('schedule.markDone') : income ? t('schedule.markReceived') : t('schedule.markPaid');

  return (
    <Screen safeTop={false}>
      {error ? <Banner tone="error" message={error} /> : null}

      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
          <KindGlyph kind={item.kind} size={28} color={item.kind === 'reminder' ? colors.primary : income ? colors.income : colors.expense} />
        </View>
        <AppText variant="title" align="center">
          {item.title}
        </AppText>
        {item.amount_minor !== null ? (
          <AmountText amountMinor={item.amount_minor} currency={currency} variant="amount" compact color={income ? 'income' : 'text'} />
        ) : null}
        <AppText variant="body" color="textSecondary">
          {t(`schedule.kinds.${item.kind}`)} · {formatDayShort(due, language)}
        </AppText>
        <AppText variant="caption" color={state === 'overdue' ? 'danger' : 'textTertiary'}>
          {t(`schedule.states.${income && state === 'overdue' ? 'notReceived' : state}`)}
        </AppText>
      </View>

      {completion ? (
        <>
          {completion.transaction_id ? <Banner tone="success" message={t('schedule.recordedInHistory')} /> : null}
          <Button label={t('schedule.undo')} icon={Undo2} variant="secondary" fullWidth loading={undo.isPending} onPress={() => void cancel()} />
        </>
      ) : (
        <>
          {needsAccount ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="caption" color="textSecondary">
                {income ? t('schedule.receivedOn') : t('schedule.paidFrom')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
                {active.map((a) => (
                  <ChoiceChip key={a.id} label={a.name} icon={ACCOUNT_ICONS[a.type]} selected={chosenAccount === a.id} onPress={() => setAccountId(a.id)} />
                ))}
              </View>
              <AppText variant="small" color="textTertiary">
                {income ? t('schedule.willRecordIncome') : t('schedule.willRecordExpense')}
              </AppText>
            </View>
          ) : null}
          <Button label={payLabel} icon={Check} fullWidth loading={complete.isPending} onPress={() => void run('paid')} />
          {item.kind !== 'reminder' ? (
            <Button label={t('schedule.skip')} icon={SkipForward} variant="ghost" fullWidth onPress={() => void run('skipped')} />
          ) : null}
        </>
      )}

      <Button
        label={t('schedule.editItem')}
        icon={Pencil}
        variant="ghost"
        fullWidth
        onPress={() => router.push({ pathname: '/scheduled/[id]', params: { id: item.id } })}
      />
    </Screen>
  );
}
