import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { chartScale, daysBetween, type TrendPoint } from '@/core/bodyweight';
import { parseIsoDate } from '@/core/dates';
import { kgToDisplay, type WeightUnit } from '@/core/units';
import { useTheme } from '@/hooks/use-theme';

const Y_GUTTER = 40;
const TOP = 8;
const BOTTOM = 22;

export function shortDate(iso: string, withYear = false): string {
  return parseIsoDate(iso).toLocaleDateString(undefined, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

function fmt(v: number, unit: WeightUnit): string {
  return unit === 'kg' ? v.toFixed(1) : String(Math.round(v));
}

/** A straight line between two points, drawn with a rotated View (no chart library needed). */
function Segment({ x1, y1, x2, y2, color, thickness }: { x1: number; y1: number; x2: number; y2: number; color: string; thickness: number }) {
  // Extend by the line thickness so neighbouring segments overlap at the joins (no gaps).
  const len = Math.hypot(x2 - x1, y2 - y1) + thickness;
  if (len <= thickness + 0.5) return null;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - len / 2,
        top: (y1 + y2) / 2 - thickness / 2,
        width: len,
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}

/**
 * Body-weight chart: each weigh-in as a dot, the 7-day trend as a line.
 * Tap anywhere on the chart to read the nearest weigh-in. `compact` drops axes and readout.
 */
export function WeightChart({ points, unit, height = 180, compact }: { points: TrendPoint[]; unit: WeightUnit; height?: number; compact?: boolean }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  if (!points.length) return null;

  const sel = picked != null && picked < points.length ? picked : points.length - 1;
  const raw = points.map((p) => kgToDisplay(p.kg, unit));
  const trend = points.map((p) => kgToDisplay(p.trendKg, unit));
  const scale = chartScale([...raw, ...trend], unit === 'kg' ? 2 : 4);

  const gutter = compact ? 0 : Y_GUTTER;
  const top = compact ? 4 : TOP;
  const bottom = compact ? 4 : BOTTOM;
  const plotW = Math.max(0, width - gutter - 8);
  const plotH = height - top - bottom;
  const span = daysBetween(points[0].date, points[points.length - 1].date);
  const xs = points.map((p) => gutter + 4 + (span ? (daysBetween(points[0].date, p.date) / span) * plotW : plotW / 2));
  const y = (v: number) => top + (1 - (v - scale.min) / (scale.max - scale.min || 1)) * plotH;
  const showDots = points.length <= 120;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pick = (x: number) => {
    let best = 0;
    xs.forEach((px, i) => {
      if (Math.abs(px - x) < Math.abs(xs[best] - x)) best = i;
    });
    setPicked(best);
  };

  const p = points[sel];
  return (
    <View style={{ gap: 8 }}>
      {!compact ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {fmt(raw[sel], unit)} {unit}
            <Text style={{ color: t.textSecondary, fontWeight: '500' }}>  ·  trend {fmt(trend[sel], unit)}</Text>
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>{shortDate(p.date, true)}</Text>
        </View>
      ) : null}
      <Plot
        onLayout={onLayout}
        onPress={compact ? undefined : (x) => pick(x)}
        label={`Body weight chart, ${points.length} weigh-ins, latest ${fmt(raw[raw.length - 1], unit)} ${unit}`}
        height={height}
      >
        {width > 0 ? (
          <>
            {!compact
              ? scale.ticks.map((v) => (
                  <View key={v} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: y(v) - 7, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ width: Y_GUTTER - 6, fontSize: 10, color: t.textSecondary, textAlign: 'right', marginRight: 6, fontVariant: ['tabular-nums'] }}>{fmt(v, unit)}</Text>
                    <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />
                  </View>
                ))
              : null}

            {!compact ? <View pointerEvents="none" style={{ position: 'absolute', left: xs[sel], top, width: 1, height: plotH, backgroundColor: t.accent + '55' }} /> : null}

            {showDots
              ? raw.map((v, i) => (
                  <View
                    key={points[i].date}
                    pointerEvents="none"
                    style={{ position: 'absolute', left: xs[i] - 2.5, top: y(v) - 2.5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.textSecondary, opacity: 0.55 }}
                  />
                ))
              : null}

            {trend.slice(1).map((v, i) => (
              <Segment key={points[i + 1].date} x1={xs[i]} y1={y(trend[i])} x2={xs[i + 1]} y2={y(v)} color={t.accent} thickness={compact ? 2 : 2.5} />
            ))}

            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: xs[sel] - 5,
                top: y(raw[sel]) - 5,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: t.accent,
                borderWidth: 2,
                borderColor: t.backgroundElement,
              }}
            />

            {!compact ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: gutter, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 10, color: t.textSecondary }}>{shortDate(points[0].date)}</Text>
                {span > 20 ? <Text style={{ fontSize: 10, color: t.textSecondary }}>{shortDate(points[Math.floor(points.length / 2)].date)}</Text> : null}
                <Text style={{ fontSize: 10, color: t.textSecondary }}>{shortDate(points[points.length - 1].date)}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </Plot>
    </View>
  );
}

/** Tappable plot area; a plain View when compact so taps reach the parent card. */
function Plot({ children, onLayout, onPress, label, height }: { children: ReactNode; onLayout: (e: LayoutChangeEvent) => void; onPress?: (x: number) => void; label: string; height: number }) {
  if (!onPress)
    return (
      <View onLayout={onLayout} accessibilityLabel={label} style={{ height }}>
        {children}
      </View>
    );
  return (
    <Pressable onLayout={onLayout} onPress={(e) => onPress(e.nativeEvent.locationX)} accessibilityLabel={label} style={{ height }}>
      {children}
    </Pressable>
  );
}
