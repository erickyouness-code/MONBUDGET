/**
 * Design tokens : la source unique des couleurs, espacements et tailles.
 * Les composants n'utilisent jamais de couleur "en dur" : ils lisent ces valeurs
 * via useTheme(), ce qui garantit des modes clair et sombre cohérents.
 *
 * Style : violet en couleur principale, cartes blanches aérées, tuiles teintées
 * (vert = revenus, rouge = dépenses, violet = solde).
 */

export type ColorTokens = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  income: string;
  incomeSoft: string;
  expense: string;
  expenseSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  overlay: string;
  gridLine: string;
  shadow: string;
};

const light: ColorTokens = {
  background: '#F6F6FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F0F9',
  border: '#ECEBF5',
  text: '#16142B',
  textSecondary: '#5F5C78',
  textTertiary: '#8D8AA6',
  primary: '#5B4FE0',
  primaryPressed: '#4A3FCB',
  onPrimary: '#FFFFFF',
  primarySoft: '#EEECFD',
  income: '#1E9E62',
  incomeSoft: '#E9F8F0',
  expense: '#D64545',
  expenseSoft: '#FDEDED',
  warning: '#A86A06',
  warningSoft: '#FDF3DF',
  danger: '#D64545',
  overlay: 'rgba(22, 20, 43, 0.45)',
  gridLine: '#ECEBF5',
  shadow: 'rgba(40, 33, 120, 0.08)',
};

const dark: ColorTokens = {
  background: '#0E0D1A',
  surface: '#17162A',
  surfaceMuted: '#211F38',
  border: '#2A2843',
  text: '#F3F2FA',
  textSecondary: '#ABA8C4',
  textTertiary: '#7A7796',
  primary: '#8C82FF',
  primaryPressed: '#7A6FF0',
  onPrimary: '#0E0D1A',
  primarySoft: '#2A2654',
  income: '#4FD394',
  incomeSoft: '#14302A',
  expense: '#FF7A7A',
  expenseSoft: '#3A1D24',
  warning: '#F2B649',
  warningSoft: '#33280F',
  danger: '#FF7A7A',
  overlay: 'rgba(0, 0, 0, 0.6)',
  gridLine: '#25233D',
  shadow: 'rgba(0, 0, 0, 0.35)',
};

/** Couleurs des catégories dans les graphiques (contrastées entre elles). */
export const chartPalette: Record<ColorMode, string[]> = {
  light: ['#5B4FE0', '#4C8DF6', '#3CC386', '#B072E8', '#F5A524', '#A3A1B8'],
  dark: ['#8C82FF', '#6AA5FF', '#4FD394', '#C595F5', '#F7B84B', '#6F6C8A'],
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Échelle typographique. */
export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '700' },
  amount: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  small: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Police Inter : une famille par graisse (nécessaire sur Android). */
export const interFamilies = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
} as const;

export type ColorMode = 'light' | 'dark';

export type Theme = {
  mode: ColorMode;
  colors: ColorTokens;
  chart: string[];
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
};

export const themes: Record<ColorMode, Theme> = {
  light: { mode: 'light', colors: light, chart: chartPalette.light, spacing, radius, typography },
  dark: { mode: 'dark', colors: dark, chart: chartPalette.dark, spacing, radius, typography },
};
