import { router, useLocalSearchParams } from 'expo-router';
import { Archive, ArchiveRestore, Minus, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useArchiveGoal, useDeleteContribution, useDeleteGoal, useGoalContributions, useGoals } from '@/features/goals/api';
import { PlanBox, goalInsights } from '@/features/goals/components';
import { GoalGlyph } from '@/features/goals/icons';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { formatDayShort } from '@/shared/lib/dates';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Button, Card, Screen } from '@/shared/ui';
import { ProgressRing } from '@/shared/ui/charts/ProgressRing';

/** Fiche d'un objectif : progression, plan d'épargne, historique des versements. */
export default function GoalDetailScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const goals = useGoals();
  const contributions = useGoalContributions(id);
  const archive = useArchiveGoal();
  const remove = useDeleteGoal();
  const removeContribution = useDeleteContribution();

  const goal = goals.data?.find((g) => g.id === id);
  if (!goal) {
    return (
      <Screen safeTop={false}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  const { progress } = goalInsights(goal);
  const money = (v: number) => formatMoneyCompact(v, goal.currency_code, language);

  const onDelete = async () => {
    const ok = await confirmAction({
      title: t('goals.deleteTitle'),
      message: t('goals.deleteMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await remove.mutateAsync(goal.id);
    router.back();
  };

  const onDeleteContribution = async (contributionId: string) => {
    const ok = await confirmAction({
      title: t('goals.deleteContributionTitle'),
      message: t('goals.deleteContributionMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) removeContribution.mutate(contributionId);
  };

  return (
    <Screen safeTop={false}>
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <ProgressRing progress={progress.ratio} size={160} thickness={16}>
          <GoalGlyph icon={goal.icon} size={28} color={colors.primary} />
          <AppText variant="title">{progress.percent} %</AppText>
        </ProgressRing>
        <AppText variant="title" align="center">
          {goal.name}
        </AppText>
        <AppText variant="body" color="textSecondary" tabular>
          {t('goals.savedOf', { saved: money(goal.savedMinor), target: money(goal.target_minor) })}
        </AppText>
        {goal.target_date ? (
          <AppText variant="caption" color="textTertiary">
            {t('goals.deadline', { date: formatDayShort(goal.target_date, language) })}
          </AppText>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button
            label={t('goals.deposit')}
            icon={Plus}
            fullWidth
            onPress={() => router.push({ pathname: '/goal/contribute/[id]', params: { id: goal.id, mode: 'deposit' } })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('goals.withdraw')}
            icon={Minus}
            variant="secondary"
            fullWidth
            disabled={goal.savedMinor <= 0}
            onPress={() => router.push({ pathname: '/goal/contribute/[id]', params: { id: goal.id, mode: 'withdraw' } })}
          />
        </View>
      </View>

      <PlanBox goal={goal} />

      <View style={{ gap: spacing.sm }}>
        <AppText variant="overline" color="textSecondary">
          {t('goals.history').toUpperCase()}
        </AppText>
        <Card style={{ paddingVertical: spacing.xs }}>
          {(contributions.data ?? []).length === 0 ? (
            <AppText variant="caption" color="textTertiary" style={{ paddingVertical: spacing.md }}>
              {t('goals.noContributions')}
            </AppText>
          ) : (
            (contributions.data ?? []).map((c, i) => (
              <View key={c.id}>
                {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint={t('goals.longPressToDelete')}
                  onLongPress={() => void onDeleteContribution(c.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="bodyStrong">
                      {c.is_initial ? t('goals.initialAmount') : c.amount_minor > 0 ? t('goals.depositNoun') : t('goals.withdrawNoun')}
                    </AppText>
                    <AppText variant="small" color="textTertiary" numberOfLines={1}>
                      {[formatDayShort(c.occurred_on, language), c.note].filter(Boolean).join(' · ')}
                    </AppText>
                  </View>
                  <AmountText
                    amountMinor={c.amount_minor}
                    currency={goal.currency_code}
                    compact
                    signDisplay="always"
                    color={c.amount_minor > 0 ? 'income' : 'text'}
                  />
                </Pressable>
              </View>
            ))
          )}
        </Card>
        {(contributions.data ?? []).length > 0 ? (
          <AppText variant="small" color="textTertiary">
            {t('goals.longPressToDelete')}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button
          label={t('goals.edit')}
          icon={Pencil}
          variant="secondary"
          fullWidth
          onPress={() => router.push({ pathname: '/goal/edit/[id]', params: { id: goal.id } })}
        />
        <Button
          label={goal.is_archived ? t('goals.unarchive') : t('goals.archive')}
          icon={goal.is_archived ? ArchiveRestore : Archive}
          variant="ghost"
          fullWidth
          onPress={() => {
            archive.mutate({ id: goal.id, archived: !goal.is_archived });
            router.back();
          }}
        />
        <Button label={t('common.delete')} icon={Trash2} variant="ghost" fullWidth onPress={() => void onDelete()} />
      </View>
    </Screen>
  );
}
