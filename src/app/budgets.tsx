import { router } from 'expo-router';
import { Info, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { monthStart, useBudgetStatus } from '@/features/budgets/api';
import { CategoryBudgetRow, GlobalBudgetCard } from '@/features/budgets/components';
import { daysLeftInMonth, usedPercent } from '@/features/budgets/logic';
import { useCategories } from '@/features/categories/api';
import { useCurrency } from '@/features/profile/api';
import { useLanguage } from '@/shared/i18n';
import { formatMonthLong } from '@/shared/lib/dates';
import { formatMoneyCompact } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Banner, Button, Card, Screen } from '@/shared/ui';

/** Budgets du mois en cours : global et par catégorie. */
export default function BudgetsScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing } = useTheme();
  const currency = useCurrency();
  const today = new Date();
  const status = useBudgetStatus(monthStart(today));
  const categories = useCategories();

  const global = status.data?.find((b) => b.categoryId === null);
  const byCategory = (status.data ?? [])
    .filter((b) => b.categoryId !== null)
    .sort((a, b) => usedPercent(b) - usedPercent(a));
  const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const sumOfCaps = byCategory.reduce((sum, b) => sum + b.limitMinor, 0);

  return (
    <Screen safeTop={false}>
      <View style={{ gap: spacing.xxs }}>
        <AppText variant="headline">{formatMonthLong(today, language)}</AppText>
        <AppText variant="caption" color="textSecondary">
          {t('budgets.daysLeft', { count: daysLeftInMonth(today) })}
        </AppText>
      </View>

      {status.isError ? <Banner tone="error" message={t('errors.loadMessage')} /> : null}
      {status.isPending ? <ActivityIndicator color={colors.primary} /> : null}

      {status.isSuccess ? (
        <>
          <GlobalBudgetCard budget={global} currency={currency} today={today} onEdit={() => router.push('/budget/global')} />
          {global ? (
            <Button label={t('budgets.editGlobal')} variant="ghost" onPress={() => router.push('/budget/global')} />
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <AppText variant="overline" color="textSecondary">
              {t('budgets.byCategory').toUpperCase()}
            </AppText>
            {byCategory.length > 0 ? (
              <Card style={{ paddingVertical: spacing.xs }}>
                {byCategory.map((b, i) => (
                  <View key={b.categoryId}>
                    {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
                    <CategoryBudgetRow
                      budget={b}
                      category={categoryById.get(b.categoryId!)}
                      currency={currency}
                      onPress={() => router.push({ pathname: '/budget/[key]', params: { key: b.categoryId! } })}
                    />
                  </View>
                ))}
              </Card>
            ) : (
              <AppText variant="caption" color="textTertiary">
                {t('budgets.noCategoryBudgets')}
              </AppText>
            )}
            <Button label={t('budgets.addCategory')} icon={Plus} fullWidth onPress={() => router.push('/budget/new')} />
          </View>

          {global && sumOfCaps > global.limitMinor ? (
            <Banner
              tone="info"
              message={t('budgets.capsAboveGlobal', {
                caps: formatMoneyCompact(sumOfCaps, currency, language),
                global: formatMoneyCompact(global.limitMinor, currency, language),
              })}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Info size={16} color={colors.textTertiary} style={{ marginTop: 2 }} />
            <AppText variant="small" color="textTertiary" style={{ flex: 1 }}>
              {t('budgets.howItWorks')}
            </AppText>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
