import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, FlaskConical, Scale } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BalanceTrendCard,
  CategoryBreakdownCard,
  MonthlyBarsCard,
  RecentTransactionsCard,
  SavingsCard,
  SubscriptionsCard,
} from '@/features/dashboard/components/Cards';
import { ChangeBadge } from '@/features/dashboard/components/ChangeBadge';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { BalanceHero, MonthSwitcher } from '@/features/dashboard/components/Overview';
import { StatTile } from '@/features/dashboard/components/parts';
import { canGoForward, computeChange, savingsRate, shiftMonth } from '@/features/dashboard/logic';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import { useProfile } from '@/features/profile/api';
import { toYearMonth } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

/** Apparition en cascade, discrète. */
const enter = (index: number) => FadeInDown.delay(index * 60).duration(380);

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const profile = useProfile();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [refreshing, setRefreshing] = useState(false);
  const data = useDashboardData(month);

  const isCurrentMonth = !canGoForward(month);
  const rate = savingsRate(data.incomeMinor, data.expensesMinor);
  const name = profile.data?.display_name;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['transactions'] }),
      client.invalidateQueries({ queryKey: ['accounts'] }),
    ]);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: spacing.huge,
        paddingHorizontal: spacing.xl,
        gap: spacing.lg,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <DashboardHeader />

      <View style={{ gap: spacing.xxs, marginTop: spacing.sm }}>
        {name ? (
          <AppText variant="body" color="textSecondary">
            {t('dashboard.hello', { name })}
          </AppText>
        ) : null}
        <AppText variant="title" accessibilityRole="header">
          {t('dashboard.title')}
        </AppText>
      </View>

      {data.isDemo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: colors.warningSoft,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}
        >
          <FlaskConical size={16} color={colors.warning} />
          <AppText variant="caption" style={{ color: colors.warning, flex: 1 }}>
            {t('dashboard.demoBanner')}
          </AppText>
        </View>
      ) : null}

      <Animated.View entering={enter(0)}>
        <BalanceHero data={data} />
      </Animated.View>

      <MonthSwitcher
        data={data}
        month={month}
        canNext={!isCurrentMonth}
        onPrevious={() => setMonth((m) => shiftMonth(m, -1))}
        onNext={() => setMonth((m) => shiftMonth(m, 1))}
      />

      <Animated.View entering={enter(1)} style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatTile
            tone="income"
            icon={ArrowDownLeft}
            label={t('dashboard.income')}
            amountMinor={data.incomeMinor}
            currency={data.currency}
            footer={<ChangeBadge change={computeChange(data.incomeMinor, data.previousIncomeMinor)} goodWhen="up" />}
          />
          <StatTile
            tone="expense"
            icon={ArrowUpRight}
            label={t('dashboard.expenses')}
            amountMinor={data.expensesMinor}
            currency={data.currency}
            footer={<ChangeBadge change={computeChange(data.expensesMinor, data.previousExpensesMinor)} goodWhen="down" />}
          />
        </View>
        <StatTile
          tone="violet"
          icon={Scale}
          label={t('dashboard.monthNet')}
          amountMinor={data.incomeMinor - data.expensesMinor}
          currency={data.currency}
          footer={
            <AppText variant="small" color="textSecondary">
              {rate === null ? t('dashboard.savingsRateNone') : t('dashboard.savingsRate', { rate })}
            </AppText>
          }
        />
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <BalanceTrendCard data={data} />
      </Animated.View>
      <Animated.View entering={enter(3)}>
        <MonthlyBarsCard data={data} highlightMonth={toYearMonth(month)} />
      </Animated.View>
      <Animated.View entering={enter(4)}>
        <CategoryBreakdownCard data={data} />
      </Animated.View>
      {isCurrentMonth ? (
        <>
          <Animated.View entering={enter(5)}>
            <RecentTransactionsCard data={data} />
          </Animated.View>
          <Animated.View entering={enter(6)}>
            <SavingsCard data={data} />
          </Animated.View>
          <Animated.View entering={enter(7)}>
            <SubscriptionsCard data={data} />
          </Animated.View>
        </>
      ) : null}
    </ScrollView>
  );
}
