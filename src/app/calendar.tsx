import { router } from 'expo-router';
import { CalendarDays, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useCurrency } from '@/features/profile/api';
import { useCompletions, useScheduledItems } from '@/features/schedule/api';
import { MonthGrid, OccurrenceRow, marksFor } from '@/features/schedule/components';
import { monthTotals, occurrencesBetween, upcoming, type Occurrence } from '@/features/schedule/logic';
import { toISODate } from '@/features/transactions/logic';
import { useLanguage } from '@/shared/i18n';
import { formatDayShort } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Banner, Button, Card, EmptyState, Screen } from '@/shared/ui';

/** Calendrier financier : échéances du mois et à venir. */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  const items = useScheduledItems();
  const completions = useCompletions();
  const today = toISODate(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);

  const monthStart = toISODate(month);
  const monthEnd = toISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const isCurrentMonth = monthStart.slice(0, 7) === today.slice(0, 7);

  const monthOccurrences = useMemo(
    () => occurrencesBetween(items.data ?? [], completions.data ?? [], monthStart, monthEnd, today),
    [items.data, completions.data, monthStart, monthEnd, today],
  );
  const marks = useMemo(() => marksFor(monthOccurrences), [monthOccurrences]);
  const totals = monthTotals(items.data ?? [], completions.data ?? [], monthStart, today);
  const groups = upcoming(items.data ?? [], completions.data ?? [], today);

  const changeMonth = (delta: number) => {
    setSelected(null);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const loading = items.isPending || completions.isPending;
  const empty = items.isSuccess && (items.data?.length ?? 0) === 0;

  return (
    <Screen safeTop={false}>
      {items.isError ? <Banner tone="error" message={t('errors.loadMessage')} /> : null}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Card tone="expense" style={{ flex: 1, gap: spacing.xxs, padding: spacing.lg }}>
          <AppText variant="small" color="textSecondary">
            {t('schedule.toPay')}
          </AppText>
          <AmountText amountMinor={totals.toPayMinor} currency={currency} variant="headline" compact />
        </Card>
        <Card tone="income" style={{ flex: 1, gap: spacing.xxs, padding: spacing.lg }}>
          <AppText variant="small" color="textSecondary">
            {t('schedule.toReceive')}
          </AppText>
          <AmountText amountMinor={totals.toReceiveMinor} currency={currency} variant="headline" compact />
        </Card>
      </View>

      <Card>
        <MonthGrid
          month={month}
          marks={marks}
          selected={selected}
          today={today}
          onSelect={setSelected}
          onPrevious={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
        />
      </Card>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {empty ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={t('schedule.emptyTitle')}
            message={t('schedule.emptyMessage')}
            action={<Button label={t('schedule.add')} icon={Plus} onPress={() => router.push('/scheduled/new')} />}
          />
        </Card>
      ) : selected ? (
        <Section
          title={formatDayShort(selected, language)}
          list={monthOccurrences.filter((o) => o.dueOn === selected)}
          emptyText={t('schedule.nothingThatDay')}
          currency={currency}
        />
      ) : isCurrentMonth ? (
        <>
          <Section title={t('schedule.overdue')} list={groups.overdue} currency={currency} danger />
          <Section title={t('schedule.today')} list={groups.today} currency={currency} />
          <Section title={t('schedule.thisWeek')} list={groups.week} currency={currency} />
          <Section title={t('schedule.later')} list={groups.later} currency={currency} />
          {groups.overdue.length + groups.today.length + groups.week.length + groups.later.length === 0 && !loading ? (
            <AppText variant="caption" color="textTertiary" align="center">
              {t('schedule.nothingSoon')}
            </AppText>
          ) : null}
        </>
      ) : (
        <Section title={t('schedule.thisMonth')} list={monthOccurrences} emptyText={t('schedule.nothingThisMonth')} currency={currency} />
      )}

      {!empty ? <Button label={t('schedule.add')} icon={Plus} fullWidth onPress={() => router.push('/scheduled/new')} /> : null}
    </Screen>
  );
}

function Section({
  title,
  list,
  emptyText,
  currency,
  danger,
}: {
  title: string;
  list: Occurrence[];
  emptyText?: string;
  currency: ReturnType<typeof useCurrency>;
  danger?: boolean;
}) {
  const { colors, spacing } = useTheme();
  if (list.length === 0 && !emptyText) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <AppText variant="overline" color={danger ? 'danger' : 'textSecondary'}>
        {title.toUpperCase()}
      </AppText>
      <Card style={{ paddingVertical: spacing.xs }}>
        {list.length === 0 ? (
          <AppText variant="caption" color="textTertiary" style={{ paddingVertical: spacing.md }}>
            {emptyText}
          </AppText>
        ) : (
          list.map((o, i) => (
            <View key={`${o.item.id}|${o.dueOn}`}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
              <OccurrenceRow occurrence={o} currency={currency} />
            </View>
          ))
        )}
      </Card>
    </View>
  );
}
