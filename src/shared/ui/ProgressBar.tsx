import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

type Props = {
  /** Part consommée : 0 = vide, 1 = plein (au-delà, la barre reste pleine). */
  value: number;
  tone: 'ok' | 'warning' | 'exceeded';
  height?: number;
  /** Position du seuil d'alerte (0 à 1), marquée d'un trait. */
  marker?: number;
};

/** Barre de progression d'un budget, colorée selon son niveau. */
export function ProgressBar({ value, tone, height = 8, marker }: Props) {
  const { colors, radius } = useTheme();
  const fill = { ok: colors.primary, warning: colors.warning, exceeded: colors.danger }[tone];
  const clamped = Math.min(Math.max(value, 0), 1);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      style={{ height, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}
    >
      <View style={{ width: `${clamped * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
      {marker !== undefined && marker > 0 && marker < 1 ? (
        <View style={{ position: 'absolute', start: `${marker * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.surface }} />
      ) : null}
    </View>
  );
}
