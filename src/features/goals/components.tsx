import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { toISODate } from '@/features/transactions/logic';
import { CURRENCIES } from '@/shared/config/currencies';
import { useLanguage } from '@/shared/i18n';
import { formatDayShort, formatMonthLong } from '@/shared/lib/dates';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Card } from '@/shared/ui';
import { ProgressRing } from '@/shared/ui/charts/ProgressRing';

import type { GoalWithProgress } from './api';
import { GoalGlyph } from './icons';
import { estimateCompletion, goalStatus, planContributions, progressOf, type GoalStatus, type Plan } from './logic';

/** Tous les calculs d'un objectif, au même endroit. */
export function goalInsights(goal: GoalWithProgress, today = new Date()) {
  const todayIso = toISODate(today);
  const progress = progressOf(goal.savedMinor, goal.target_minor);
  const unit = 10 ** CURRENCIES[goal.currency_code].decimals;
  const plan = planContributions(progress.remainingMinor, todayIso, goal.target_date, unit);
  const estimate = estimateCompletion(progress.remainingMinor, goal.savedLast90Minor, goal.created_at.slice(0, 10), todayIso);
  const status = goalStatus(plan, estimate, goal.target_date);
  return { progress, plan, estimate, status };
}

export function StatusBadge({ status }: { status: GoalStatus }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  if (status === 'unknown') return null;
  const style = {
    reached: { fg: colors.income, bg: colors.incomeSoft },
    onTrack: { fg: colors.primary, bg: colors.primarySoft },
    behind: { fg: colors.warning, bg: colors.warningSoft },
    overdue: { fg: colors.danger, bg: colors.expenseSoft },
  }[status];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: style.bg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
      <AppText variant="small" style={{ color: style.fg }}>
        {t(`goals.status.${status}`)}
      </AppText>
    </View>
  );
}

/** Carte d'un objectif dans la liste. */
export function GoalCard({ goal, onPress }: { goal: GoalWithProgress; onPress: () => void }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const { progress, plan, status } = goalInsights(goal);
  const money = (v: number) => formatMoneyCompact(v, goal.currency_code, language);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={goal.name} onPress={onPress}>
      {({ pressed }) => (
        <Card style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center', opacity: pressed ? 0.85 : 1 }}>
          <ProgressRing progress={progress.ratio} size={72} thickness={8}>
            <GoalGlyph icon={goal.icon} size={24} color={colors.primary} />
          </ProgressRing>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <AppText variant="headline" numberOfLines={1}>
              {goal.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" tabular>
              {t('goals.savedOf', { saved: money(goal.savedMinor), target: money(goal.target_minor) })} · {progress.percent} %
            </AppText>
            <AppText variant="small" color="textTertiary">
              {planLine(plan, money, t as unknown as TFunction, goal.target_date, language)}
            </AppText>
            <StatusBadge status={status} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}

function planLine(
  plan: Plan,
  money: (v: number) => string,
  t: TFunction,
  targetDate: string | null,
  language: ReturnType<typeof useLanguage>,
): string {
  switch (plan.kind) {
    case 'reached':
      return t('goals.reachedLine');
    case 'noDeadline':
      return t('goals.noDeadline');
    case 'overdue':
      return t('goals.overdueLine', { date: formatDayShort(targetDate!, language) });
    case 'plan':
      return t('goals.perMonthLine', { amount: money(plan.perMonthMinor), date: formatDayShort(targetDate!, language) });
  }
}

/** Bloc « Plan d'épargne » : par mois, par semaine, estimation. */
export function PlanBox({ goal }: { goal: GoalWithProgress }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const { progress, plan, estimate, status } = goalInsights(goal);
  const money = (v: number) => formatMoneyCompact(v, goal.currency_code, language);

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="headline">{t('goals.planTitle')}</AppText>
        <StatusBadge status={status} />
      </View>

      {plan.kind === 'plan' ? (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Figure label={t('goals.perMonth')} amountMinor={plan.perMonthMinor} goal={goal} />
          <Figure label={t('goals.perWeek')} amountMinor={plan.perWeekMinor} goal={goal} />
        </View>
      ) : null}

      <AppText variant="caption" color="textSecondary">
        {plan.kind === 'plan'
          ? t('goals.planExplain', {
              remaining: money(progress.remainingMinor),
              date: formatDayShort(goal.target_date!, language),
              days: plan.daysLeft,
            })
          : plan.kind === 'overdue'
            ? t('goals.overdueExplain', { remaining: money(progress.remainingMinor) })
            : plan.kind === 'noDeadline'
              ? t('goals.noDeadlineExplain')
              : t('goals.reachedExplain')}
      </AppText>

      {plan.kind !== 'reached' ? (
        <AppText variant="small" color={status === 'behind' ? 'warning' : 'textTertiary'}>
          {estimate
            ? t('goals.estimate', { month: formatMonthLong(new Date(`${estimate}T12:00:00`), language) })
            : t('goals.noEstimate')}
        </AppText>
      ) : null}
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <AppText variant="small" color="textTertiary">
        {t('goals.notAffectingAccounts')}
      </AppText>
    </Card>
  );
}

function Figure({ label, amountMinor, goal }: { label: string; amountMinor: number; goal: GoalWithProgress }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xxs }}>
      <AppText variant="small" color="textSecondary">
        {label}
      </AppText>
      <AmountText amountMinor={amountMinor} currency={goal.currency_code} variant="headline" compact color="primary" />
    </View>
  );
}
