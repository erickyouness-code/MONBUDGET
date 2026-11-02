import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useIsRTL, useLanguage } from '@/shared/i18n';
import { formatDayShort, formatMonthLong } from '@/shared/lib/dates';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Card } from '@/shared/ui';

import type { DashboardData } from '../types';

/** Grande carte « Solde disponible » : total de vos comptes actifs. */
export function BalanceHero({ data }: { data: DashboardData }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();

  return (
    <Card tone="primary" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="caption" style={{ color: colors.onPrimary, opacity: 0.85 }}>
          {t('dashboard.availableBalance')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('accounts.title')}
          onPress={() => router.push('/accounts')}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            backgroundColor: 'rgba(255,255,255,0.16)',
            borderRadius: radius.pill,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Wallet size={14} color={colors.onPrimary} />
          <AppText variant="small" style={{ color: colors.onPrimary }}>
            {t('dashboard.accountsCount', { count: data.accountsCount })}
          </AppText>
        </Pressable>
      </View>
      {data.totalBalanceMinor === null ? (
        <AppText variant="display" style={{ color: colors.onPrimary, opacity: 0.5 }}>
          —
        </AppText>
      ) : (
        <AmountText
          amountMinor={data.totalBalanceMinor}
          currency={data.currency}
          variant="display"
          compact
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ color: colors.onPrimary }}
        />
      )}
      <AppText variant="small" style={{ color: colors.onPrimary, opacity: 0.75 }}>
        {t('dashboard.availableBalanceHint')}
      </AppText>
    </Card>
  );
}

/** Sélecteur de mois (‹ Novembre 2026 ›) + base de comparaison. */
export function MonthSwitcher({
  data,
  month,
  onPrevious,
  onNext,
  canNext,
}: {
  data: DashboardData;
  month: Date;
  onPrevious: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const isRTL = useIsRTL();
  const { colors, spacing } = useTheme();
  const flip = isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
  const { previous, mode } = data.comparison;

  const basis =
    mode === 'samePeriod'
      ? t('dashboard.comparedToPeriod', { from: formatDayShort(previous.from, language), to: formatDayShort(previous.to, language) })
      : t('dashboard.comparedToMonth', { month: formatMonthLong(new Date(`${previous.from}T12:00:00`), language) });

  return (
    <View style={{ gap: spacing.xxs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.previousMonth')} onPress={onPrevious} hitSlop={12}>
          <ChevronLeft size={22} color={colors.text} style={flip} />
        </Pressable>
        <AppText variant="headline" accessibilityRole="header">
          {formatMonthLong(month, language)}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.nextMonth')}
          accessibilityState={{ disabled: !canNext }}
          disabled={!canNext}
          onPress={onNext}
          hitSlop={12}
        >
          <ChevronRight size={22} color={canNext ? colors.text : colors.border} style={flip} />
        </Pressable>
      </View>
      <AppText variant="small" color="textTertiary" align="center">
        {basis}
      </AppText>
    </View>
  );
}
