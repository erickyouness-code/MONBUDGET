import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

type Segment = { value: number; color: string };

type Props = {
  segments: Segment[];
  size?: number;
  thickness?: number;
  /** Contenu affiché au centre de l'anneau. */
  children?: ReactNode;
};

/** Graphique en anneau. Sans données, affiche un anneau gris neutre. */
export function DonutChart({ segments, size = 140, thickness = 20, children }: Props) {
  const { colors } = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;

  const visible = segments.filter((s) => s.value > 0);
  const lengths = visible.map((s) => (s.value / total) * circumference);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));

  const arcs = visible.map((s, i) => (
    <Circle
      key={i}
      cx={size / 2}
      cy={size / 2}
      r={r}
      stroke={s.color}
      strokeWidth={thickness}
      fill="none"
      strokeDasharray={`${Math.max(lengths[i]! - gap, 0.5)} ${circumference}`}
      strokeDashoffset={-offsets[i]!}
    />
  ));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceMuted} strokeWidth={thickness} fill="none" />
          {arcs}
        </G>
      </Svg>
      {children}
    </View>
  );
}
