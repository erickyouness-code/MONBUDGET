import { router, useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { monthStart, useBudgetStatus, useSetBudget } from '@/features/budgets/api';
import { useCategories } from '@/features/categories/api';
import { CategoryGlyph, categoryLabel } from '@/features/categories/meta';
import { useCurrency } from '@/features/profile/api';
import { useTransactionsInRange } from '@/features/transactions/api';
import { monthRange } from '@/features/transactions/logic';
import { useLanguage } from '@/shared/i18n';
import { confirmAction } from '@/shared/lib/confirm';
import { formatMoneyCompact, parseAmountToMinor } from '@/shared/lib/money';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountInput, AppText, Banner, Button, ChoiceChip, Screen } from '@/shared/ui';

const THRESHOLDS = [70, 80, 90, 100];

/**
 * Définir un plafond.
 * key = "global" (budget du mois), "new" (choisir une catégorie) ou l'id d'une catégorie.
 */
export default function BudgetEditScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { colors, spacing, radius } = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const currency = useCurrency();
  const status = useBudgetStatus(monthStart());
  const categories = useCategories();
  const month = useTransactionsInRange(monthRange());
  const setBudget = useSetBudget();

  const [chosen, setChosen] = useState<string | null>(key === 'new' || key === 'global' ? null : key);
  const categoryId = key === 'global' ? null : chosen;
  const existing = status.data?.find((b) => b.categoryId === categoryId && (key === 'global' || categoryId !== null));

  const [amount, setAmount] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Valeurs affichées : saisie en cours, sinon réglage existant.
  const amountValue =
    amount ?? (existing ? formatMoneyCompact(existing.limitMinor, currency, 'fr', { hideSymbol: true }).replace(/\s/g, '') : '');
  const thresholdValue = threshold ?? existing?.thresholdPct ?? 80;

  // Dépenses du mois par catégorie, pour aider à choisir un plafond réaliste.
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of month.data ?? []) {
      if (r.type === 'expense' && r.category_id) map.set(r.category_id, (map.get(r.category_id) ?? 0) + r.amount_minor);
    }
    return map;
  }, [month.data]);
  const totalSpent = [...spentByCategory.values()].reduce((a, b) => a + b, 0);

  const budgeted = new Set((status.data ?? []).map((b) => b.categoryId));
  const choices = (categories.data ?? [])
    .filter((c) => c.kind === 'expense' && !c.is_archived && !budgeted.has(c.id))
    .sort((a, b) => (spentByCategory.get(b.id) ?? 0) - (spentByCategory.get(a.id) ?? 0));
  const selected = categories.data?.find((c) => c.id === categoryId);
  const spentHere = key === 'global' ? totalSpent : categoryId ? (spentByCategory.get(categoryId) ?? 0) : 0;

  const save = async () => {
    setError(null);
    if (key !== 'global' && !categoryId) return setError(t('budgets.errors.categoryRequired'));
    const limitMinor = parseAmountToMinor(amountValue, currency);
    if (!limitMinor) return setError(t('transactions.errors.amountInvalid'));
    try {
      await setBudget.mutateAsync({ categoryId, limitMinor, thresholdPct: thresholdValue });
      router.back();
    } catch {
      setError(t('errors.saveFailed'));
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: t('budgets.removeTitle'),
      message: t('budgets.removeMessage'),
      confirmLabel: t('budgets.remove'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await setBudget.mutateAsync({ categoryId, limitMinor: null, thresholdPct: thresholdValue });
      router.back();
    } catch {
      setError(t('errors.saveFailed'));
    }
  };

  return (
    <Screen safeTop={false}>
      {error ? <Banner tone="error" message={error} /> : null}

      {key === 'new' && !chosen ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" color="textSecondary">
            {t('budgets.chooseCategory')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md }} accessibilityRole="radiogroup">
            {choices.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityLabel={categoryLabel(c, t)}
                onPress={() => setChosen(c.id)}
                style={{ width: '25%', alignItems: 'center', gap: spacing.xs }}
              >
                <View
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: radius.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.surfaceMuted,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <CategoryGlyph category={c} size={22} color={c.color ?? colors.primary} />
                </View>
                <AppText variant="small" align="center" numberOfLines={2} color="textSecondary">
                  {categoryLabel(c, t)}
                </AppText>
                {spentByCategory.get(c.id) ? (
                  <AppText variant="small" color="textTertiary" tabular numberOfLines={1}>
                    {formatMoneyCompact(spentByCategory.get(c.id)!, currency, language)}
                  </AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            {selected ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <CategoryGlyph category={selected} size={20} color={selected.color ?? colors.primary} />
                <AppText variant="headline">{categoryLabel(selected, t)}</AppText>
              </View>
            ) : (
              <AppText variant="headline">{t('budgets.monthlyBudget')}</AppText>
            )}
            <AppText variant="caption" color="textTertiary" align="center">
              {t('budgets.spentSoFar', { amount: formatMoneyCompact(spentHere, currency, language) })}
            </AppText>
          </View>

          <AmountInput value={amountValue} onChange={setAmount} currency={currency} label={t('budgets.limit')} autoFocus={!existing} />

          <View style={{ gap: spacing.sm }}>
            <AppText variant="caption" color="textSecondary">
              {t('budgets.alertAt')}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
              {THRESHOLDS.map((pct) => (
                <ChoiceChip key={pct} label={`${pct} %`} selected={thresholdValue === pct} onPress={() => setThreshold(pct)} />
              ))}
            </View>
            <AppText variant="small" color="textTertiary">
              {t('budgets.alertAtHint')}
            </AppText>
          </View>

          <Button label={t('common.save')} fullWidth loading={setBudget.isPending && !!amountValue} onPress={() => void save()} />
          {existing ? (
            <Button label={t('budgets.remove')} icon={Trash2} variant="ghost" fullWidth onPress={() => void remove()} />
          ) : null}
          <AppText variant="small" color="textTertiary" align="center">
            {t('budgets.appliesFrom')}
          </AppText>
        </>
      )}
    </Screen>
  );
}
