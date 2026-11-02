import { Text, type TextProps } from 'react-native';

import { useLanguage } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { interFamilies, type ColorTokens, type TypographyVariant } from '../theme/tokens';

type Props = TextProps & {
  variant?: TypographyVariant;
  color?: keyof ColorTokens;
  /** Chiffres à largeur fixe : les montants restent alignés. */
  tabular?: boolean;
  align?: 'auto' | 'center';
};

/**
 * Texte de l'application : applique la typographie et la couleur du thème.
 * Police Inter en français et anglais ; police du système en arabe
 * (Inter ne contient pas les caractères arabes).
 */
export function AppText({ variant = 'body', color = 'text', tabular, align = 'auto', style, ...rest }: Props) {
  const theme = useTheme();
  const language = useLanguage();
  const base = theme.typography[variant];
  const font =
    language === 'ar' ? null : { fontFamily: interFamilies[base.fontWeight], fontWeight: 'normal' as const };

  return (
    <Text
      {...rest}
      style={[
        base,
        font,
        { color: theme.colors[color], textAlign: align },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}
