import { router } from 'expo-router';
import {
  CalendarClock,
  ChartPie,
  ChevronDown,
  ChevronUp,
  Coins,
  Hourglass,
  PiggyBank,
  Repeat,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useCategories } from '@/features/categories/api';
import { categoryLabel } from '@/features/categories/meta';
import type { CurrencyCode } from '@/shared/config/currencies';
import { useLanguage } from '@/shared/i18n';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card } from '@/shared/ui';

import type { Insight } from './engine';

type Action = { label: string; onPress: () => void };
type Content = { icon: LucideIcon; title: string; body?: string; tip?: string; basis: string; actions: Action[]; lines?: string[] };

/** Transforme une analyse (données brutes) en texte clair dans la langue de l'utilisateur. */
function useDescribe(currency: CurrencyCode) {
  const { t } = useTranslation();
  const language = useLanguage();
  const categories = useCategories();
  const money = (v: number) => formatMoneyCompact(v, currency, language);
  const name = (id: string | null) =>
    id === null ? t('budgets.global') : categoryLabel(categories.data?.find((c) => c.id === id), t);
  const day = new Date().getDate();

  return (i: Insight): Content => {
    switch (i.kind) {
      case 'notEnoughData':
        return {
          icon: Hourglass,
          title: t('insights.notEnoughData.title'),
          body: t('insights.notEnoughData.body', { count: i.count }),
          basis: t('insights.notEnoughData.basis'),
          actions: [{ label: t('dashboard.addFirst'), onPress: () => router.push('/add') }],
        };
      case 'spendingOverIncome':
        return {
          icon: TriangleAlert,
          title: t('insights.spendingOverIncome.title'),
          body: t('insights.spendingOverIncome.body', { expenses: money(i.expensesMinor), income: money(i.incomeMinor), gap: money(i.gapMinor) }),
          tip: t('insights.spendingOverIncome.tip'),
          basis: t('insights.basisMonth'),
          actions: [{ label: t('budgets.title'), onPress: () => router.push('/budgets') }],
        };
      case 'savingsRate':
        return i.severity === 'positive'
          ? { icon: PiggyBank, title: t('insights.savingsGood.title', { rate: i.rate }), body: t('insights.savingsGood.body'), basis: t('insights.basisMonth'), actions: [] }
          : {
              icon: PiggyBank,
              title: t('insights.savingsLow.title', { rate: i.rate }),
              body: t('insights.savingsLow.body'),
              basis: t('insights.basisMonth'),
              actions: [{ label: t('goals.create'), onPress: () => router.push('/goal/edit/new') }],
            };
      case 'budgetExceeded':
        return {
          icon: TriangleAlert,
          title: t('insights.budgetExceeded.title', { name: name(i.categoryId) }),
          body: t('insights.budgetExceeded.body', { over: money(i.overMinor), percent: i.percent }),
          tip: t('insights.budgetExceeded.tip'),
          basis: t('insights.basisBudget'),
          actions: [{ label: t('budgets.title'), onPress: () => router.push('/budgets') }],
        };
      case 'budgetWarning':
        return {
          icon: TriangleAlert,
          title: t('insights.budgetWarning.title', { name: name(i.categoryId), percent: i.percent }),
          body: t('insights.budgetWarning.body', { remaining: money(i.remainingMinor) }),
          basis: t('insights.basisBudget'),
          actions: [{ label: t('budgets.title'), onPress: () => router.push('/budgets') }],
        };
      case 'categoryUp':
        return {
          icon: TrendingUp,
          title: t('insights.categoryUp.title', { name: name(i.categoryId), percent: i.percent }),
          body: t('insights.categoryUp.body', { current: money(i.currentMinor), average: money(i.averageMinor), months: i.months }),
          tip: t('insights.categoryUp.tip'),
          basis: t('insights.basisCompare', { day }),
          actions: [
            { label: t('insights.setLimit'), onPress: () => router.push({ pathname: '/budget/[key]', params: { key: i.categoryId } }) },
            { label: t('insights.seeExpenses'), onPress: () => router.push({ pathname: '/transactions', params: { q: name(i.categoryId) } }) },
          ],
        };
      case 'categoryDown':
        return {
          icon: TrendingDown,
          title: t('insights.categoryDown.title', { name: name(i.categoryId), percent: Math.abs(i.percent) }),
          body: t('insights.categoryDown.body', { current: money(i.currentMinor), average: money(i.averageMinor), months: i.months }),
          basis: t('insights.basisCompare', { day }),
          actions: [],
        };
      case 'endOfMonth':
        return {
          icon: CalendarClock,
          title:
            i.severity === 'warning'
              ? t('insights.endOfMonth.titleWarning')
              : t('insights.endOfMonth.titleInfo', { estimate: money(i.estimateMinor) }),
          body: t('insights.endOfMonth.body', {
            balance: money(i.balanceMinor),
            incoming: money(i.incomingMinor),
            outgoing: money(i.outgoingMinor),
            estimate: money(i.estimateMinor),
          }),
          tip: i.severity === 'warning' ? t('insights.endOfMonth.tip') : undefined,
          basis: t('insights.endOfMonth.basis'),
          actions: [{ label: t('schedule.title'), onPress: () => router.push('/calendar') }],
        };
      case 'topCategories':
        return {
          icon: ChartPie,
          title: t('insights.topCategories.title'),
          lines: i.items.map((c) => `${name(c.categoryId)} : ${money(c.amountMinor)} (${c.share} %)`),
          body: t('insights.topCategories.body', { total: money(i.totalMinor) }),
          basis: t('insights.basisMonth'),
          actions: [],
        };
      case 'smallExpenses':
        return {
          icon: Coins,
          title: t('insights.smallExpenses.title'),
          body: t('insights.smallExpenses.body', { count: i.count, threshold: money(i.thresholdMinor), total: money(i.totalMinor) }),
          tip: t('insights.smallExpenses.tip'),
          basis: t('insights.basisMonth'),
          actions: [],
        };
      case 'recurring':
        return {
          icon: Repeat,
          title: t('insights.recurring.title'),
          body: t('insights.recurring.body'),
          basis: t('insights.recurring.basis'),
          actions: [],
        };
    }
  };
}

/** Carte d'une analyse. `compact` : version courte pour l'accueil. */
export function InsightCard({ insight, currency, compact }: { insight: Insight; currency: CurrencyCode; compact?: boolean }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const categories = useCategories();
  const { colors, spacing, radius } = useTheme();
  const describe = useDescribe(currency);
  const [open, setOpen] = useState(false);
  const c = describe(insight);
  const tone = { warning: colors.warning, positive: colors.income, info: colors.primary }[insight.severity];
  const soft = { warning: colors.warningSoft, positive: colors.incomeSoft, info: colors.primarySoft }[insight.severity];

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
          <c.icon size={19} color={tone} />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="bodyStrong">{c.title}</AppText>
          {c.body ? (
            <AppText variant="caption" color="textSecondary">
              {c.body}
            </AppText>
          ) : null}
          {c.lines?.map((line) => (
            <AppText key={line} variant="caption" tabular>
              • {line}
            </AppText>
          ))}
        </View>
      </View>

      {!compact && insight.kind === 'recurring'
        ? insight.items.map((r) => (
            <View key={r.key} style={{ gap: spacing.xs, paddingStart: 50 }}>
              <View>
                <AppText variant="caption">{r.label ?? categoryLabel(categories.data?.find((x) => x.id === r.categoryId), t)}</AppText>
                <AppText variant="small" color="textTertiary">
                  {t('insights.recurring.item', { amount: formatMoneyCompact(r.typicalMinor, currency, language), months: r.months })}
                </AppText>
              </View>
              {r.inCalendar ? (
                <AppText variant="small" color="income">
                  {t('insights.recurring.inCalendar')}
                </AppText>
              ) : (
                <Button
                  label={t('insights.recurring.addToCalendar')}
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/scheduled/[id]',
                      params: {
                        id: 'new',
                        title: r.label ?? '',
                        amount: String(r.typicalMinor),
                        categoryId: r.categoryId ?? '',
                        day: r.lastDate.slice(8, 10),
                      },
                    })
                  }
                />
              )}
            </View>
          ))
        : null}

      {!compact && c.tip ? (
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md }}>
          <AppText variant="caption">💡 {c.tip}</AppText>
        </View>
      ) : null}

      {!compact && c.actions.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {c.actions.map((a) => (
            <Button key={a.label} label={a.label} variant="secondary" onPress={a.onPress} />
          ))}
        </View>
      ) : null}

      {!compact ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {open ? <ChevronUp size={14} color={colors.textTertiary} /> : <ChevronDown size={14} color={colors.textTertiary} />}
          <AppText variant="small" color="textTertiary">
            {t('insights.howCalculated')}
          </AppText>
        </Pressable>
      ) : null}
      {open ? (
        <AppText variant="small" color="textTertiary">
          {c.basis}
        </AppText>
      ) : null}
    </Card>
  );
}
