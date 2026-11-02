import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useLanguage } from '@/shared/i18n';
import { percentages } from '@/shared/lib/chart';
import { formatDayShort, formatMonthShort } from '@/shared/lib/dates';
import { formatPlainNumber, toMajorRounded } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Button } from '@/shared/ui';
import { DonutChart } from '@/shared/ui/charts/DonutChart';
import { BarChart } from '@/shared/ui/charts/BarChart';
import { LineAreaChart } from '@/shared/ui/charts/LineAreaChart';
import { ProgressRing } from '@/shared/ui/charts/ProgressRing';

import type { DashboardData } from '../types';
import { Chip, EmptyHint, MoneyRow, SectionCard, TextLink } from './parts';

type Props = { data: DashboardData };

export function BalanceTrendCard({ data }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { currency, balanceHistory } = data;
  const hasData = balanceHistory.length > 0;

  return (
    <SectionCard title={t('dashboard.balanceTrend')} accessory={<Chip label={t('dashboard.last6Months')} />}>
      {hasData ? (
        <LineAreaChart
          values={balanceHistory.map((p) => toMajorRounded(p.balanceMinor, currency))}
          labels={balanceHistory.map((p) => formatMonthShort(p.month, language))}
          formatTick={(v) => formatPlainNumber(v, language)}
        />
      ) : (
        <EmptyHint text={t('dashboard.emptyChart')} />
      )}
    </SectionCard>
  );
}

export function MonthlyBarsCard({ data, highlightMonth }: Props & { highlightMonth: string }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const { currency, monthly } = data;
  const hasData = monthly.some((m) => m.incomeMinor > 0 || m.expensesMinor > 0);
  const highlight = monthly.findIndex((m) => m.month === highlightMonth);

  return (
    <SectionCard title={t('dashboard.incomeVsExpenses')}>
      {hasData ? (
        <View style={{ gap: spacing.md }}>
          <BarChart
            series={[
              { values: monthly.map((m) => toMajorRounded(m.incomeMinor, currency)), color: colors.income },
              { values: monthly.map((m) => toMajorRounded(m.expensesMinor, currency)), color: colors.expense },
            ]}
            labels={monthly.map((m) => formatMonthShort(m.month, language))}
            formatTick={(v) => formatPlainNumber(v, language)}
            highlight={highlight >= 0 ? highlight : undefined}
          />
          <View style={{ flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' }}>
            <Legend color={colors.income} label={t('dashboard.income')} />
            <Legend color={colors.expense} label={t('dashboard.expenses')} />
          </View>
        </View>
      ) : (
        <EmptyHint text={t('dashboard.emptyChart')} />
      )}
    </SectionCard>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <AppText variant="caption" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

export function CategoryBreakdownCard({ data }: Props) {
  const { t } = useTranslation();
  const { chart, spacing } = useTheme();
  const items = [...data.expensesByCategory].sort((a, b) => b.amountMinor - a.amountMinor);
  const shares = percentages(items.map((i) => i.amountMinor));
  const top = items[0];

  return (
    <SectionCard title={t('dashboard.byCategory')}>
      {items.length === 0 ? (
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <DonutChart segments={[]} size={120} thickness={16} />
          <EmptyHint text={t('dashboard.emptyCategories')} />
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <DonutChart segments={items.map((item, i) => ({ value: item.amountMinor, color: chart[i % chart.length]! }))}>
            {top ? (
              <View style={{ alignItems: 'center', maxWidth: 90 }}>
                <AppText variant="headline">{shares[0]}%</AppText>
                <AppText variant="small" color="textTertiary" numberOfLines={1}>
                  {top.label}
                </AppText>
              </View>
            ) : null}
          </DonutChart>
          <View style={{ alignSelf: 'stretch', gap: spacing.sm }}>
            {items.map((item, i) => (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: chart[i % chart.length] }} />
                <AppText variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                  {item.label}
                </AppText>
                <AmountText amountMinor={item.amountMinor} currency={data.currency} variant="caption" compact />
                <AppText variant="caption" color="textTertiary" tabular style={{ minWidth: 36, textAlign: 'right' }}>
                  {shares[i]}%
                </AppText>
              </View>
            ))}
          </View>
        </View>
      )}
    </SectionCard>
  );
}

export function SavingsCard({ data }: Props) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const goal = data.savingsGoal;

  if (!goal) {
    return (
      <SectionCard title={t('dashboard.savings')}>
        <EmptyHint
          text={t('dashboard.emptySavings')}
          action={<Button label={t('dashboard.createGoal')} variant="secondary" icon={Plus} onPress={() => router.push('/goal/edit/new')} />}
        />
      </SectionCard>
    );
  }

  const progress = goal.targetMinor > 0 ? goal.currentMinor / goal.targetMinor : 0;

  return (
    <SectionCard
      title={t('dashboard.savings')}
      accessory={data.isDemo ? <Chip label={goal.name} /> : <TextLink label={t('common.seeAll')} onPress={() => router.push('/goals')} />}
    >
      {!data.isDemo ? (
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {goal.name}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
        <ProgressRing progress={progress} size={112} thickness={14}>
          <AppText variant="headline">{Math.floor(progress * 100)}%</AppText>
          <AppText variant="small" color="textTertiary">
            {t('dashboard.reached')}
          </AppText>
        </ProgressRing>
        <View style={{ flex: 1, gap: spacing.md }}>
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color="textTertiary">
              {t('dashboard.goal')}
            </AppText>
            <AmountText amountMinor={goal.targetMinor} currency={data.currency} variant="headline" compact />
          </View>
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="caption" color="textTertiary">
              {t('dashboard.current')}
            </AppText>
            <AmountText amountMinor={goal.currentMinor} currency={data.currency} variant="headline" color="primary" compact />
          </View>
        </View>
      </View>
    </SectionCard>
  );
}

export function SubscriptionsCard({ data }: Props) {
  const { t } = useTranslation();
  const { spacing } = useTheme();

  return (
    <SectionCard title={t('dashboard.subscriptions')}>
      {data.subscriptions.length === 0 ? (
        <EmptyHint text={t('dashboard.emptySubscriptions')} />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {data.subscriptions.map((s) => (
            <MoneyRow
              key={s.id}
              icon={s.icon}
              title={s.name}
              subtitle={t('dashboard.everyMonthOn', { day: s.dayOfMonth })}
              amountMinor={s.amountMinor}
              currency={data.currency}
            />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

export function RecentTransactionsCard({ data }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { spacing } = useTheme();
  const items = data.recentTransactions;

  return (
    <SectionCard
      title={t('dashboard.recent')}
      accessory={items.length > 0 ? <TextLink label={t('common.seeAll')} onPress={() => router.push('/transactions')} /> : undefined}
    >
      {items.length === 0 ? (
        <EmptyHint
          text={t('dashboard.emptyRecent')}
          action={<Button label={t('dashboard.addFirst')} icon={Plus} onPress={() => router.push('/add')} />}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {items.map((tx) => (
            <MoneyRow
              key={tx.id}
              icon={tx.icon}
              title={tx.label}
              subtitle={formatDayShort(tx.date, language)}
              amountMinor={tx.amountMinor}
              currency={data.currency}
              showSign={!tx.neutral}
              onPress={
                tx.transactionId
                  ? () => router.push({ pathname: '/transaction/[id]', params: { id: tx.transactionId! } })
                  : undefined
              }
            />
          ))}
        </View>
      )}
    </SectionCard>
  );
}
