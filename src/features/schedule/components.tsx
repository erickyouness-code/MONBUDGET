import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { CurrencyCode } from '@/shared/config/currencies';
import { useIsRTL, useLanguage } from '@/shared/i18n';
import { formatDayShort, formatMonthLong } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText } from '@/shared/ui';

import { isIncome, type Occurrence } from './logic';
import { KindGlyph } from './meta';

export type DayMarks = { expense: boolean; income: boolean; reminder: boolean; overdue: boolean };

/** Repères du calendrier : quels jours ont des échéances, et de quel genre. */
export function marksFor(occurrences: Occurrence[]): Map<string, DayMarks> {
  const map = new Map<string, DayMarks>();
  for (const o of occurrences) {
    const m = map.get(o.dueOn) ?? { expense: false, income: false, reminder: false, overdue: false };
    if (o.item.kind === 'reminder') m.reminder = true;
    else if (isIncome(o.item)) m.income = true;
    else m.expense = true;
    if (o.state === 'overdue') m.overdue = true;
    map.set(o.dueOn, m);
  }
  return map;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Grille du mois avec des points de couleur sous les jours concernés. */
export function MonthGrid({
  month,
  marks,
  selected,
  today,
  onSelect,
  onPrevious,
  onNext,
}: {
  month: Date;
  marks: Map<string, DayMarks>;
  selected: string | null;
  today: string;
  onSelect: (day: string | null) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const isRTL = useIsRTL();
  const { colors, spacing, radius } = useTheme();
  const flip = isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        try {
          return new Intl.DateTimeFormat(language === 'ar' ? 'ar-MA' : language, { weekday: 'narrow' }).format(new Date(2026, 0, 5 + i));
        } catch {
          return ['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]!;
        }
      }),
    [language],
  );

  const y = month.getFullYear();
  const m = month.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.previousMonth')} onPress={onPrevious} hitSlop={12}>
          <ChevronLeft size={22} color={colors.text} style={flip} />
        </Pressable>
        <AppText variant="headline">{formatMonthLong(month, language)}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.nextMonth')} onPress={onNext} hitSlop={12}>
          <ChevronRight size={22} color={colors.text} style={flip} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {weekdays.map((w, i) => (
          <AppText key={i} variant="small" color="textTertiary" align="center" style={{ flex: 1 }}>
            {w}
          </AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const iso = `${y}-${pad(m + 1)}-${pad(day)}`;
          const mark = marks.get(iso);
          const isSelected = iso === selected;
          const isToday = iso === today;
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${formatDayShort(iso, language)}${mark ? `, ${t('schedule.hasItems')}` : ''}`}
              onPress={() => onSelect(isSelected ? null : iso)}
              style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                  borderWidth: isToday && !isSelected ? 1.5 : mark?.overdue ? 1.5 : 0,
                  borderColor: mark?.overdue ? colors.danger : colors.primary,
                }}
              >
                <AppText variant="caption" tabular style={{ color: isSelected ? colors.onPrimary : colors.text }}>
                  {day}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', gap: 2, height: 5 }}>
                {mark?.expense ? <Dot color={colors.expense} /> : null}
                {mark?.income ? <Dot color={colors.income} /> : null}
                {mark?.reminder ? <Dot color={colors.primary} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />;
}

/** Ligne d'une échéance : icône, titre, date / état, montant. */
export function OccurrenceRow({ occurrence, currency }: { occurrence: Occurrence; currency: CurrencyCode }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  const { item, dueOn, state } = occurrence;
  const income = isIncome(item);
  const done = state === 'paid' || state === 'skipped';
  const tint = item.kind === 'reminder' ? colors.primary : income ? colors.income : colors.expense;
  const stateColor = state === 'overdue' ? 'danger' : state === 'today' ? 'warning' : 'textTertiary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/occurrence', params: { itemId: item.id, due: dueOn } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, opacity: pressed ? 0.7 : done ? 0.55 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <KindGlyph kind={item.kind} size={19} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={done ? { textDecorationLine: 'line-through' } : undefined}>
          {item.title}
        </AppText>
        <AppText variant="small" color={stateColor} numberOfLines={1}>
          {formatDayShort(dueOn, language)} · {t(`schedule.states.${income && state === 'overdue' ? 'notReceived' : state}`)}
        </AppText>
      </View>
      {item.amount_minor !== null ? (
        <AmountText
          amountMinor={income ? item.amount_minor : -item.amount_minor}
          currency={currency}
          compact
          signDisplay="always"
          color={income ? 'income' : 'text'}
        />
      ) : null}
    </Pressable>
  );
}
