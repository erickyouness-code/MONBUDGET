import { ArrowLeftRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { CategoryGlyph, categoryLabel } from '@/features/categories/meta';
import type { CurrencyCode } from '@/shared/config/currencies';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AmountText, AppText } from '@/shared/ui';

import type { Category, Transaction } from './types';

type Props = {
  tx: Transaction;
  category?: Category;
  accountName?: string;
  toAccountName?: string;
  currency: CurrencyCode;
  onPress?: () => void;
};

/** Ligne d'historique : icône de catégorie, libellé, compte, montant signé. */
export function TransactionRow({ tx, category, accountName, toAccountName, currency, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();

  const isTransfer = tx.type === 'transfer';
  const tint = isTransfer ? colors.primary : (category?.color ?? colors.textSecondary);
  const catLabel = isTransfer ? t('add.transfer') : categoryLabel(category, t);
  const title = tx.description || catLabel;
  const subtitle = isTransfer
    ? `${accountName ?? '—'} → ${toAccountName ?? '—'}`
    : [tx.description ? catLabel : null, accountName].filter(Boolean).join(' · ');

  const signed = tx.type === 'expense' ? -tx.amount_minor : tx.amount_minor;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radius.md,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isTransfer ? <ArrowLeftRight size={20} color={tint} /> : <CategoryGlyph category={category} size={20} color={tint} />}
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textTertiary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AmountText
        amountMinor={signed}
        currency={currency}
        compact
        signDisplay={isTransfer ? 'never' : 'always'}
        color={tx.type === 'income' ? 'income' : isTransfer ? 'textSecondary' : 'text'}
      />
    </Pressable>
  );
}
