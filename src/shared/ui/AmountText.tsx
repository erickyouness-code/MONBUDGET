import type { ComponentProps } from 'react';

import type { CurrencyCode } from '../config/currencies';
import { useLanguage } from '../i18n';
import { formatMoney, formatMoneyCompact, type SignDisplay } from '../lib/money';
import { AppText } from './AppText';

type Props = Omit<ComponentProps<typeof AppText>, 'children'> & {
  amountMinor: number;
  currency: CurrencyCode;
  signDisplay?: SignDisplay;
  /** Masque les « ,00 » inutiles (le montant reste exact). */
  compact?: boolean;
};

/** Affiche un montant correctement formaté pour la langue et la devise. */
export function AmountText({ amountMinor, currency, signDisplay, compact, variant = 'bodyStrong', ...rest }: Props) {
  const language = useLanguage();
  return (
    <AppText variant={variant} tabular {...rest}>
      {(compact ? formatMoneyCompact : formatMoney)(amountMinor, currency, language, { signDisplay })}
    </AppText>
  );
}
