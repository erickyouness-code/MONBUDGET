import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Platform, Pressable, View, type PressableProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  icon?: LucideIcon;
  fullWidth?: boolean;
  /** Affiche une roue de chargement et bloque les appuis répétés. */
  loading?: boolean;
};

export function Button({ label, variant = 'primary', icon: Icon, fullWidth, loading, onPress, disabled: disabledProp, ...rest }: Props) {
  const disabled = disabledProp || loading;
  const { colors, radius, spacing } = useTheme();

  const background = { primary: colors.primary, secondary: colors.primarySoft, ghost: 'transparent' }[variant];
  const pressedBackground = {
    primary: colors.primaryPressed,
    secondary: colors.primarySoft,
    ghost: colors.surfaceMuted,
  }[variant];
  const foreground = variant === 'primary' ? colors.onPrimary : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled}
      onPress={(event) => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={({ pressed }) => ({
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        backgroundColor: pressed ? pressedBackground : background,
        borderRadius: radius.pill,
        paddingVertical: spacing.md + 2,
        paddingHorizontal: spacing.xl,
        opacity: disabledProp ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
      {...rest}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : Icon ? (
          <Icon size={18} color={foreground} strokeWidth={2.2} />
        ) : null}
        <AppText variant="bodyStrong" style={{ color: foreground }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
