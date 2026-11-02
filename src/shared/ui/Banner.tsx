import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = { tone: 'error' | 'success' | 'info'; message: string };

/** Message encadré (erreur du serveur, confirmation d'envoi…). */
export function Banner({ tone, message }: Props) {
  const { colors, spacing, radius } = useTheme();
  const palette = {
    error: { bg: colors.expenseSoft, fg: colors.danger, Icon: CircleAlert },
    success: { bg: colors.incomeSoft, fg: colors.income, Icon: CircleCheck },
    info: { bg: colors.primarySoft, fg: colors.primary, Icon: Info },
  }[tone];

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
        backgroundColor: palette.bg,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <palette.Icon size={18} color={palette.fg} style={{ marginTop: 1 }} />
      <AppText variant="caption" style={{ color: palette.fg, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}
