import { TextInput, View } from 'react-native';

import { CURRENCIES, type CurrencyCode } from '../config/currencies';
import { sanitizeAmountInput } from '../lib/money';
import { useLanguage } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = {
  value: string;
  onChange: (value: string) => void;
  currency: CurrencyCode;
  label: string;
  error?: string;
  autoFocus?: boolean;
  tone?: 'expense' | 'income' | 'neutral';
};

/** Grand champ de montant, centré, avec le symbole de la devise. */
export function AmountInput({ value, onChange, currency, label, error, autoFocus, tone = 'neutral' }: Props) {
  const { colors, spacing, typography } = useTheme();
  const language = useLanguage();
  const color = { expense: colors.text, income: colors.income, neutral: colors.text }[tone];

  return (
    <View style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: spacing.sm, direction: 'ltr' }}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(sanitizeAmountInput(text, currency))}
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
          keyboardType={CURRENCIES[currency].decimals > 0 ? 'decimal-pad' : 'number-pad'}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          aria-invalid={!!error}
          style={[
            typography.display,
            {
              fontSize: 44,
              lineHeight: 54,
              color,
              // Largeur ajustée au contenu : le symbole de la devise reste collé au montant.
              width: Math.max(1, value.length || 1) * 27 + 16,
              maxWidth: 300,
              textAlign: 'center',
              padding: 0,
              fontVariant: ['tabular-nums'],
            },
            { outlineStyle: 'none' } as object,
          ]}
        />
        <AppText variant="title" color="textTertiary">
          {CURRENCIES[currency].symbol[language]}
        </AppText>
      </View>
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
