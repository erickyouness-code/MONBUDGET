import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/** Logo : trois barres croissantes dans un carré arrondi. */
export function Logo({ size = 34 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 34 34" accessibilityElementsHidden importantForAccessibility="no">
      <Rect width={34} height={34} rx={10} fill={colors.primary} />
      <Rect x={8} y={17} width={5} height={9} rx={2} fill={colors.onPrimary} opacity={0.6} />
      <Rect x={14.5} y={12} width={5} height={14} rx={2} fill={colors.onPrimary} opacity={0.8} />
      <Rect x={21} y={7} width={5} height={19} rx={2} fill={colors.onPrimary} />
    </Svg>
  );
}
