import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useIsRTL } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  onPress?: () => void;
};

/** Ligne de liste avec icône, titre, description et flèche. */
export function ListRow({ icon: Icon, title, description, badge, onPress }: Props) {
  const { colors, spacing, radius } = useTheme();
  const isRTL = useIsRTL();

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color={colors.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: spacing.xxs }}>
        <AppText variant="bodyStrong">{title}</AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      {badge ? (
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }}>
          <AppText variant="overline" color="textSecondary">
            {badge}
          </AppText>
        </View>
      ) : null}
      {onPress ? (
        <ChevronRight size={20} color={colors.textTertiary} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
      ) : null}
    </Pressable>
  );
}
