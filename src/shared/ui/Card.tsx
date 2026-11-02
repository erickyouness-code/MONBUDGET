import { View, type ViewProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export type CardTone = 'surface' | 'primary' | 'muted' | 'income' | 'expense' | 'violet';

type Props = ViewProps & {
  padded?: boolean;
  tone?: CardTone;
};

/** Bloc de contenu arrondi avec ombre douce. Les tons teintés servent aux chiffres clés. */
export function Card({ padded = true, tone = 'surface', style, ...rest }: Props) {
  const { colors, radius, spacing, mode } = useTheme();

  const backgroundColor = {
    surface: colors.surface,
    primary: colors.primary,
    muted: colors.surfaceMuted,
    income: colors.incomeSoft,
    expense: colors.expenseSoft,
    violet: colors.primarySoft,
  }[tone];

  const elevated = tone === 'surface';

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor,
          borderRadius: radius.xl,
          padding: padded ? spacing.xl : 0,
          borderWidth: elevated && mode === 'dark' ? 1 : 0,
          borderColor: colors.border,
          boxShadow: elevated && mode === 'light' ? `0 6px 24px ${colors.shadow}` : undefined,
        },
        style,
      ]}
    />
  );
}
