import { router } from 'expo-router';
import { ChevronRight, Target } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { CategoryGlyph, categoryLabel } from '@/features/categories/meta';
import type { Category } from '@/features/transactions/types';
import { CURRENCIES, type CurrencyCode } from '@/shared/config/currencies';
import { useIsRTL, useLanguage } from '@/shared/i18n';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText, Button, Card } from '@/shared/ui';
import { ProgressBar } from '@/shared/ui/ProgressBar';

import { budgetLevel, dailyAllowance, daysLeftInMonth, projectEndOfMonth, usedPercent, type BudgetStatus } from './logic';

const levelColor = (level: ReturnType<typeof budgetLevel>, colors: ReturnType<typeof useTheme>['colors']) =>
  ({ ok: colors.textSecondary, warning: colors.warning, exceeded: colors.danger })[level];

/**
 * Carte du budget global du mois : progression, reste, montant par jour et
 * estimation de fin de mois. `today` absent = mois passé (pas d'anticipation).
 */
export function GlobalBudgetCard({
  budget,
  currency,
  today,
  onEdit,
}: {
  budget: BudgetStatus | undefined;
  currency: CurrencyCode;
  today?: Date;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const money = (v: number) => formatMoneyCompact(v, currency, language);

  if (!budget) {
    return (
      <Card style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Target size={20} color={colors.primary} />
          <AppText variant="headline" style={{ flex: 1 }}>
            {t('budgets.monthlyBudget')}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary">
          {t('budgets.noGlobalHint')}
        </AppText>
        <Button label={t('budgets.setGlobal')} variant="secondary" onPress={() => router.push('/budget/global')} />
      </Card>
    );
  }

  const level = budgetLevel(budget);
  const remaining = budget.limitMinor - budget.spentMinor;
  const unit = 10 ** CURRENCIES[currency].decimals;
  const perDay = today ? dailyAllowance(budget.limitMinor, budget.spentMinor, today, unit) : null;
  const projection = today ? projectEndOfMonth(budget.spentMinor, today) : null;

  return (
    <Card style={{ gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        disabled={!onEdit}
        onPress={onEdit}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}
      >
        <AppText variant="headline">{t('budgets.monthlyBudget')}</AppText>
        <AppText variant="caption" color={level === 'ok' ? 'textSecondary' : level === 'warning' ? 'warning' : 'danger'}>
          {t('budgets.usedPercent', { percent: usedPercent(budget) })}
        </AppText>
      </Pressable>

      <View style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
          <View>
            <AppText variant="small" color="textTertiary">
              {remaining >= 0 ? t('budgets.remaining') : t('budgets.overBy')}
            </AppText>
            <AmountText
              amountMinor={Math.abs(remaining)}
              currency={currency}
              variant="amount"
              compact
              color={remaining >= 0 ? 'text' : 'danger'}
            />
          </View>
          <AppText variant="caption" color="textTertiary" tabular>
            {t('budgets.spentOf', { spent: money(budget.spentMinor), limit: money(budget.limitMinor) })}
          </AppText>
        </View>
        <ProgressBar value={budget.spentMinor / budget.limitMinor} tone={level} marker={budget.thresholdPct / 100} height={10} />
      </View>

      {today ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="caption" color="textSecondary">
            {perDay !== null
              ? t('budgets.perDay', { amount: money(perDay), days: daysLeftInMonth(today) })
              : t('budgets.nothingLeft')}
          </AppText>
          {projection !== null ? (
            <AppText variant="small" color={projection > budget.limitMinor ? 'warning' : 'textTertiary'}>
              {projection > budget.limitMinor
                ? t('budgets.projectionOver', { amount: money(projection) })
                : t('budgets.projectionOk', { amount: money(projection) })}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** Ligne d'un budget par catégorie. */
export function CategoryBudgetRow({
  budget,
  category,
  currency,
  onPress,
}: {
  budget: BudgetStatus;
  category: Category | undefined;
  currency: CurrencyCode;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const language = useLanguage();
  const isRTL = useIsRTL();
  const { colors, spacing, radius } = useTheme();
  const level = budgetLevel(budget);
  const remaining = budget.limitMinor - budget.spentMinor;
  const money = (v: number) => formatMoneyCompact(v, currency, language);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ gap: spacing.sm, paddingVertical: spacing.md, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
          <CategoryGlyph category={category} size={18} color={category?.color ?? colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {categoryLabel(category, t)}
          </AppText>
          <AppText variant="small" color="textTertiary" tabular>
            {t('budgets.spentOf', { spent: money(budget.spentMinor), limit: money(budget.limitMinor) })}
          </AppText>
        </View>
        <AppText variant="caption" tabular style={{ color: levelColor(level, colors) }}>
          {remaining >= 0 ? t('budgets.leftShort', { amount: money(remaining) }) : t('budgets.overShort', { amount: money(-remaining) })}
        </AppText>
        {onPress ? <ChevronRight size={18} color={colors.textTertiary} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} /> : null}
      </View>
      <ProgressBar value={budget.spentMinor / budget.limitMinor} tone={level} marker={budget.thresholdPct / 100} />
    </Pressable>
  );
}
