import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** Ligne secondaire (ex. solde du compte). */
  detail?: string;
};

/** Pastille sélectionnable (compte, moyen de paiement, filtre…). */
export function ChoiceChip({ label, selected, onPress, icon: Icon, detail }: Props) {
  const { colors, spacing, radius } = useTheme();
  const fg = selected ? colors.primary : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {Icon ? <Icon size={16} color={fg} /> : null}
      <View>
        <AppText variant="caption" style={{ color: selected ? colors.primary : colors.text }} numberOfLines={1}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="small" color="textTertiary" tabular numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}
