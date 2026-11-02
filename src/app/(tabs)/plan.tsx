import { CalendarDays, PiggyBank, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/shared/theme/ThemeProvider';
import { Card, ListRow, Screen } from '@/shared/ui';

export default function PlanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const soon = t('common.comingSoon');

  return (
    <Screen title={t('plan.title')} subtitle={t('plan.subtitle')}>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon={Wallet} title={t('plan.budgets')} description={t('plan.budgetsDescription')} badge={soon} />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <ListRow icon={PiggyBank} title={t('plan.goals')} description={t('plan.goalsDescription')} badge={soon} />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <ListRow icon={CalendarDays} title={t('plan.calendar')} description={t('plan.calendarDescription')} badge={soon} />
      </Card>
    </Screen>
  );
}
