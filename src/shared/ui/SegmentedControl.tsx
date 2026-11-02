import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './AppText';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** Choix entre quelques options exclusives (thème, langue, type de transaction…). */
export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xs }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.xs,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: selected ? colors.surface : 'transparent',
              boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.12)' : undefined,
            }}
          >
            <AppText variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
