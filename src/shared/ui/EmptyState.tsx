import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
};

/** Écran vide accueillant : explique quoi faire plutôt que d'afficher un vide. */
export function EmptyState({ icon: Icon, title, message, action }: Props) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.huge, paddingHorizontal: spacing.xl, gap: spacing.md }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.pill,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xs,
        }}
      >
        <Icon size={28} color={colors.primary} strokeWidth={2} />
      </View>
      <AppText variant="headline" align="center">
        {title}
      </AppText>
      <AppText variant="body" color="textSecondary" align="center" style={{ maxWidth: 320 }}>
        {message}
      </AppText>
      {action ? <View style={{ marginTop: spacing.sm }}>{action}</View> : null}
    </View>
  );
}
