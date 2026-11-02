import { ArrowDownLeft, ArrowUpRight, FlaskConical, Scale } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BalanceTrendCard,
  CategoryBreakdownCard,
  RecentTransactionsCard,
  SavingsCard,
  SubscriptionsCard,
} from '@/features/dashboard/components/Cards';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { StatTile } from '@/features/dashboard/components/parts';
import { useDashboardData } from '@/features/dashboard/useDashboardData';
import { useLanguage } from '@/shared/i18n';
import { formatMonthLong } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

/** Apparition en cascade, discrète. */
const enter = (index: number) => FadeInDown.delay(index * 60).duration(380);

export default function DashboardScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const data = useDashboardData();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: spacing.huge,
        paddingHorizontal: spacing.xl,
        gap: spacing.lg,
      }}
    >
      <DashboardHeader />

      <View style={{ gap: spacing.xxs, marginTop: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          {t('dashboard.title')}
        </AppText>
        <AppText variant="body" color="textSecondary">
          {formatMonthLong(new Date(), language)}
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

      <Animated.View entering={enter(0)} style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatTile tone="income" icon={ArrowDownLeft} label={t('dashboard.income')} amountMinor={data.incomeMinor} currency={data.currency} />
          <StatTile tone="expense" icon={ArrowUpRight} label={t('dashboard.expenses')} amountMinor={data.expensesMinor} currency={data.currency} />
        </View>
        <StatTile
          tone="violet"
          icon={Scale}
          label={t('dashboard.monthBalance')}
          amountMinor={data.incomeMinor - data.expensesMinor}
          currency={data.currency}
        />
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <BalanceTrendCard data={data} />
      </Animated.View>
      <Animated.View entering={enter(2)}>
        <CategoryBreakdownCard data={data} />
      </Animated.View>
      <Animated.View entering={enter(3)}>
        <SavingsCard data={data} />
      </Animated.View>
      <Animated.View entering={enter(4)}>
        <SubscriptionsCard data={data} />
      </Animated.View>
      <Animated.View entering={enter(5)}>
        <RecentTransactionsCard data={data} />
      </Animated.View>
    </ScrollView>
  );
}
