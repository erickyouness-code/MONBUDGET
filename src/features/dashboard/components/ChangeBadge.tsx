import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText } from '@/shared/ui';

import type { Change } from '../logic';

type Props = {
  change: Change;
  /** Une hausse est-elle une bonne nouvelle ? (oui pour les revenus, non pour les dépenses) */
  goodWhen: 'up' | 'down';
};

/** Petite pastille « ▲ 20 % » colorée selon que la variation est favorable ou non. */
export function ChangeBadge({ change, goodWhen }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();

  // Pas de mois de référence : on le dit, sans inventer de pourcentage.
  if (change.percent === null) {
    return (
      <AppText variant="small" color="textTertiary" numberOfLines={1}>
        {t('dashboard.noComparison')}
      </AppText>
    );
  }

  const favorable = change.direction === 'flat' ? null : change.direction === goodWhen;
  const fg = favorable === null ? colors.textSecondary : favorable ? colors.income : colors.expense;
  const bg = favorable === null ? colors.surface : favorable ? colors.incomeSoft : colors.expenseSoft;
  const Icon = change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : Minus;
  const sign = change.percent > 0 ? '+' : change.percent < 0 ? '−' : '';

  return (
    <View
      accessibilityLabel={t('dashboard.changeA11y', { value: `${sign}${Math.abs(change.percent)} %` })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 2,
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Icon size={12} color={fg} strokeWidth={2.6} />
      <AppText variant="small" tabular style={{ color: fg }}>
        {sign}
        {Math.abs(change.percent)} %
      </AppText>
    </View>
  );
}
