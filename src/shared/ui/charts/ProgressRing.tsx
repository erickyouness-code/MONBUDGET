import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  /** Entre 0 et 1. */
  progress: number;
  size?: number;
  thickness?: number;
  children?: ReactNode;
};

/** Anneau de progression (objectif d'épargne, budget consommé…). */
export function ProgressRing({ progress, size = 120, thickness = 14, children }: Props) {
  const { colors } = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.primarySoft} strokeWidth={thickness} fill="none" />
          {clamped > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={colors.primary}
              strokeWidth={thickness}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${clamped * circumference} ${circumference}`}
            />
          ) : null}
        </G>
      </Svg>
      {children}
    </View>
  );
}
