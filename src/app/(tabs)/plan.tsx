import { router } from 'expo-router';
import { CalendarDays, PiggyBank, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { monthStart, useBudgetStatus } from '@/features/budgets/api';
import { budgetLevel } from '@/features/budgets/logic';
import { useGoals } from '@/features/goals/api';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { Card, ListRow, Screen } from '@/shared/ui';

export default function PlanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const soon = t('common.comingSoon');
  const budgets = useBudgetStatus(monthStart());
  const goals = useGoals();
  const activeGoals = (goals.data ?? []).filter((g) => !g.is_archived);
  const reachedGoals = activeGoals.filter((g) => g.savedMinor >= g.target_minor).length;
  const goalsSummary =
    activeGoals.length === 0
      ? t('plan.goalsDescription')
      : t('plan.goalsSummary', { count: activeGoals.length, reached: reachedGoals });

  const count = budgets.data?.length ?? 0;
  const alerts = (budgets.data ?? []).filter((b) => budgetLevel(b) !== 'ok').length;
  const summary =
    count === 0
      ? t('plan.budgetsDescription')
      : alerts > 0
        ? t('plan.budgetsSummaryAlerts', { count, alerts })
        : t('plan.budgetsSummary', { count });

  return (
    <Screen title={t('plan.title')} subtitle={t('plan.subtitle')}>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon={Wallet} title={t('plan.budgets')} description={summary} onPress={() => router.push('/budgets')} />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <ListRow icon={PiggyBank} title={t('plan.goals')} description={goalsSummary} onPress={() => router.push('/goals')} />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <ListRow icon={CalendarDays} title={t('plan.calendar')} description={t('plan.calendarDescription')} badge={soon} />
      </Card>
    </Screen>
  );
}
