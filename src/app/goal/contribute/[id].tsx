import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isOverdrawError, useAddContribution, useGoals } from '@/features/goals/api';
import { addDays, toISODate } from '@/features/transactions/logic';
import { useLanguage } from '@/shared/i18n';
import { formatMoneyCompact, parseAmountToMinor } from '@/shared/lib/money';
import { useToast } from '@/shared/store/toast';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountInput, AppText, Banner, Button, ChoiceChip, Screen, TextField } from '@/shared/ui';

/** Versement (mode=deposit) ou retrait (mode=withdraw) sur un objectif. */
export default function ContributeScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { spacing } = useTheme();
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const withdraw = mode === 'withdraw';
  const goals = useGoals();
  const goal = goals.data?.find((g) => g.id === id);
  const add = useAddContribution();
  const showToast = useToast((s) => s.show);
  const today = toISODate(new Date());

  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!goal) return <Screen safeTop={false}>{null}</Screen>;
  const money = (v: number) => formatMoneyCompact(v, goal.currency_code, language);

  const submit = async () => {
    setError(null);
    const value = parseAmountToMinor(amount, goal.currency_code);
    if (!value) return setError(t('transactions.errors.amountInvalid'));
    if (withdraw && value > goal.savedMinor) return setError(t('goals.errors.overdraw', { max: money(goal.savedMinor) }));
    try {
      await add.mutateAsync({ goalId: goal.id, amountMinor: withdraw ? -value : value, occurredOn: day, note: note.trim() || null });
      // Objectif tout juste atteint : on le célèbre.
      if (!withdraw && goal.savedMinor < goal.target_minor && goal.savedMinor + value >= goal.target_minor) {
        showToast({ tone: 'success', title: t('goals.reachedTitle'), message: t('goals.reachedMessage', { name: goal.name }), href: '/goals' });
      }
      router.back();
    } catch (e) {
      setError(isOverdrawError(e) ? t('goals.errors.overdraw', { max: money(goal.savedMinor) }) : t('errors.saveFailed'));
    }
  };

  return (
    <Screen safeTop={false}>
      {error ? <Banner tone="error" message={error} /> : null}
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <AppText variant="headline">{goal.name}</AppText>
        <AppText variant="caption" color="textTertiary">
          {t('goals.savedOf', { saved: money(goal.savedMinor), target: money(goal.target_minor) })}
        </AppText>
      </View>

      <AmountInput
        value={amount}
        onChange={setAmount}
        currency={goal.currency_code}
        label={withdraw ? t('goals.withdrawAmount') : t('goals.depositAmount')}
        tone={withdraw ? 'neutral' : 'income'}
        autoFocus
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }} accessibilityRole="radiogroup">
        <ChoiceChip label={t('common.today')} selected={day === today} onPress={() => setDay(today)} />
        <ChoiceChip label={t('common.yesterday')} selected={day === addDays(today, -1)} onPress={() => setDay(addDays(today, -1))} />
      </View>

      <TextField label={t('goals.note')} placeholder={t('goals.notePlaceholder')} value={note} onChangeText={setNote} maxLength={100} />

      <Button
        label={withdraw ? t('goals.confirmWithdraw') : t('goals.confirmDeposit')}
        fullWidth
        loading={add.isPending}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
