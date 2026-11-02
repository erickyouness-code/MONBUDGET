import { useState } from 'react';
import { View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { useIsRTL } from '../../i18n';
import { yTicks } from '../../lib/chart';
import { useTheme } from '../../theme/ThemeProvider';

type Series = { values: number[]; color: string };

type Props = {
  /** Une ou plusieurs séries (ex. revenus et dépenses), barres côte à côte. */
  series: Series[];
  labels: string[];
  formatTick: (value: number) => string;
  height?: number;
  /** Index du groupe mis en avant (mois affiché) ; les autres sont atténués. */
  highlight?: number;
};

const AXIS_WIDTH = 52;
const LABEL_HEIGHT = 22;
const TOP_PADDING = 10;

/** Barres groupées. L'axe du temps reste de gauche à droite, même en arabe. */
export function BarChart({ series, labels, formatTick, height = 180, highlight }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const fontFamily = useIsRTL() ? undefined : 'Inter_500Medium';

  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = yTicks(max);
  const top = ticks[ticks.length - 1] || 1;

  const plotLeft = AXIS_WIDTH + 4;
  const plotWidth = Math.max(width - plotLeft - 4, 0);
  const plotHeight = height - LABEL_HEIGHT - TOP_PADDING;
  const groupWidth = labels.length ? plotWidth / labels.length : 0;
  const barGap = 3;
  const barWidth = Math.max(4, Math.min(16, (groupWidth * 0.62 - barGap * (series.length - 1)) / Math.max(series.length, 1)));
  const toY = (v: number) => TOP_PADDING + plotHeight - (Math.max(v, 0) / top) * plotHeight;

  return (
    <View style={{ direction: 'ltr', height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <Line
              key={`g${tick}`}
              x1={AXIS_WIDTH}
              x2={width}
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
          {labels.map((label, i) => {
            const center = plotLeft + groupWidth * i + groupWidth / 2;
            const total = series.length * barWidth + (series.length - 1) * barGap;
            const dim = highlight !== undefined && highlight !== i;
            return (
              <G key={`grp${i}`}>
                {series.map((s, k) => {
                  const v = s.values[i] ?? 0;
                  const y = toY(v);
                  const h = Math.max(TOP_PADDING + plotHeight - y, v > 0 ? 2 : 0);
                  return (
                    <Rect
                      key={k}
                      x={center - total / 2 + k * (barWidth + barGap)}
                      y={TOP_PADDING + plotHeight - h}
                      width={barWidth}
                      height={h}
                      rx={Math.min(4, barWidth / 2)}
                      fill={s.color}
                      opacity={dim ? 0.45 : 1}
                    />
                  );
                })}
                <SvgText
                  x={center}
                  y={height - 4}
                  fontSize={11}
                  fontFamily={fontFamily}
                  fontWeight={dim ? 'normal' : 'bold'}
                  fill={dim ? colors.textTertiary : colors.text}
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
