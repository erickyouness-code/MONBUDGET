import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useIsRTL, useLanguage } from '../i18n';
import { formatMonthLong } from '../lib/dates';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = {
  value: string; // AAAA-MM-JJ
  onChange: (value: string) => void;
  /** Date maximale autorisée (incluse). */
  max?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Calendrier mensuel simple (semaine commençant le lundi). */
export function DatePicker({ value, onChange, max }: Props) {
  const { t } = useTranslation();
  const language = useLanguage();
  const isRTL = useIsRTL();
  const { colors, spacing, radius } = useTheme();
  const [vy, vm] = value.split('-').map(Number);
  const [cursor, setCursor] = useState({ year: vy ?? 2026, month: (vm ?? 1) - 1 });

  const weekdays = useMemo(() => {
    // 5 janvier 2026 est un lundi.
    return Array.from({ length: 7 }, (_, i) => {
      try {
        return new Intl.DateTimeFormat(language === 'ar' ? 'ar-MA' : language, { weekday: 'narrow' }).format(new Date(2026, 0, 5 + i));
      } catch {
        return ['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]!;
      }
    });
  }, [language]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
    return [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [cursor]);

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const flip = isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.previousMonth')} onPress={() => move(-1)} hitSlop={10}>
          <ChevronLeft size={22} color={colors.text} style={flip} />
        </Pressable>
        <AppText variant="bodyStrong">{formatMonthLong(new Date(cursor.year, cursor.month, 1), language)}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.nextMonth')} onPress={() => move(1)} hitSlop={10}>
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
          if (day === null) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
          const date = iso(cursor.year, cursor.month, day);
          const selected = date === value;
          const disabled = !!max && date > max;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(date)}
              style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.primary : 'transparent',
                }}
              >
                <AppText
                  variant="caption"
                  tabular
                  style={{ color: selected ? colors.onPrimary : disabled ? colors.textTertiary : colors.text, opacity: disabled ? 0.4 : 1 }}
                >
                  {day}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
