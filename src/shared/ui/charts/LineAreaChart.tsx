import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { useIsRTL } from '../../i18n';
import { smoothPath, yTicks } from '../../lib/chart';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  /** Valeurs en unités principales (ex. dirhams), une par libellé. */
  values: number[];
  labels: string[];
  formatTick: (value: number) => string;
  height?: number;
};

const AXIS_WIDTH = 52;
const RIGHT_PADDING = 22; // laisse la place au dernier libellé de mois
const LABEL_HEIGHT = 22;
const TOP_PADDING = 10;

/**
 * Courbe avec zone dégradée. L'axe du temps reste de gauche à droite, même en
 * arabe : c'est la convention la plus répandue pour les graphiques.
 */
export function LineAreaChart({ values, labels, formatTick, height = 190 }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const fontFamily = useIsRTL() ? undefined : 'Inter_500Medium';

  const hasData = values.length > 0;
  const max = hasData ? Math.max(...values, 0) : 0;
  const ticks = yTicks(max);
  const top = ticks[ticks.length - 1] || 1;

  const plotLeft = AXIS_WIDTH + 12;
  const plotWidth = Math.max(width - plotLeft - RIGHT_PADDING, 0);
  const plotHeight = height - LABEL_HEIGHT - TOP_PADDING;
  const stepX = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;
  const toY = (v: number) => TOP_PADDING + plotHeight - (Math.max(v, 0) / top) * plotHeight;

  const points = values.map((v, i) => ({ x: plotLeft + i * stepX, y: toY(v) }));
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const baseline = TOP_PADDING + plotHeight;
  const area = last ? `${line} L${last.x},${baseline} L${plotLeft},${baseline} Z` : '';

  return (
    <View style={{ direction: 'ltr', height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.22} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {ticks.map((tick) => (
            <Line
              key={`g${tick}`}
              x1={AXIS_WIDTH}
              x2={width - 4}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke={colors.gridLine}
              strokeWidth={1}
              strokeDasharray={tick === 0 ? undefined : '4 4'}
            />
          ))}
          {ticks.map((tick) => (
            <SvgText key={`t${tick}`} x={AXIS_WIDTH - 4} y={toY(tick) + 4} fontSize={11} fontFamily={fontFamily} fill={colors.textTertiary} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          ))}
          {labels.map((label, i) => (
            <SvgText key={`l${i}`} x={plotLeft + i * stepX} y={height - 4} fontSize={11} fontFamily={fontFamily} fill={colors.textTertiary} textAnchor="middle">
              {label}
            </SvgText>
          ))}

          {hasData ? (
            <>
              <Path d={area} fill="url(#area)" />
              <Path d={line} stroke={colors.primary} strokeWidth={3} fill="none" strokeLinecap="round" />
              {last ? (
                <>
                  <Circle cx={last.x} cy={last.y} r={7} fill={colors.primary} opacity={0.2} />
                  <Circle cx={last.x} cy={last.y} r={4} fill={colors.primary} stroke={colors.surface} strokeWidth={2} />
                </>
              ) : null}
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
