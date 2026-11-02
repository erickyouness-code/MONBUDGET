import { router } from 'expo-router';
import { PiggyBank, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useGoals } from '@/features/goals/api';
import { GoalCard } from '@/features/goals/components';
import { useCurrency } from '@/features/profile/api';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Banner, Button, Card, EmptyState, Screen } from '@/shared/ui';

/** Liste des objectifs d'épargne. */
export default function GoalsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  const goals = useGoals();
  const [showArchived, setShowArchived] = useState(false);

  const active = (goals.data ?? []).filter((g) => !g.is_archived);
  const archived = (goals.data ?? []).filter((g) => g.is_archived);
  const totalSaved = active.reduce((sum, g) => sum + g.savedMinor, 0);
  const open = (id: string) => router.push({ pathname: '/goal/[id]', params: { id } });

  return (
    <Screen safeTop={false}>
      {goals.isError ? <Banner tone="error" message={t('errors.loadMessage')} /> : null}
      {goals.isPending ? <ActivityIndicator color={colors.primary} /> : null}

      {goals.isSuccess && active.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title={t('goals.emptyTitle')}
            message={t('goals.emptyMessage')}
            action={<Button label={t('goals.create')} icon={Plus} onPress={() => router.push('/goal/edit/new')} />}
          />
        </Card>
      ) : null}

      {active.length > 0 ? (
        <>
          <Card tone="violet" style={{ gap: spacing.xs }}>
            <AppText variant="caption" color="textSecondary">
              {t('goals.totalSaved')}
            </AppText>
            <AmountText amountMinor={totalSaved} currency={currency} variant="title" compact />
          </Card>
          <View style={{ gap: spacing.md }}>
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} onPress={() => open(g.id)} />
            ))}
          </View>
          <Button label={t('goals.create')} icon={Plus} fullWidth onPress={() => router.push('/goal/edit/new')} />
        </>
      ) : null}

      {archived.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <Button
            label={t('goals.archivedCount', { count: archived.length })}
            variant="ghost"
            onPress={() => setShowArchived((s) => !s)}
          />
          {showArchived ? archived.map((g) => <GoalCard key={g.id} goal={g} onPress={() => open(g.id)} />) : null}
        </View>
      ) : null}
    </Screen>
  );
}
