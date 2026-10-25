import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Fonts } from '@/constants/theme';
import { LevelColors as L } from '@/constants/level-theme';

export const MONO = Fonts?.mono ?? 'monospace';

/** HUD-style text: uppercase, tracked out, monospaced. */
export function HudText({ children, size = 12, color = L.dim, weight = '600', style }: { children: ReactNode; size?: number; color?: string; weight?: '400' | '600' | '700'; style?: object }) {
  return <Text style={[{ fontFamily: MONO, fontSize: size, color, fontWeight: weight, letterSpacing: size >= 20 ? 1 : 1.6 }, style]}>{children}</Text>;
}

function Corner({ pos, color }: { pos: 'tl' | 'tr' | 'bl' | 'br'; color: string }) {
  const top = pos[0] === 't';
  const left = pos[1] === 'l';
  const s: ViewStyle = {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: color,
    ...(top ? { top: -1, borderTopWidth: 2 } : { bottom: -1, borderBottomWidth: 2 }),
    ...(left ? { left: -1, borderLeftWidth: 2 } : { right: -1, borderRightWidth: 2 }),
  };
  return <View pointerEvents="none" style={s} />;
}

/** Bright corner brackets for a framed HUD box. Place inside a positioned container. */
export function HudCorners({ color }: { color: string }) {
  return (
    <>
      <Corner pos="tl" color={color} />
      <Corner pos="tr" color={color} />
      <Corner pos="bl" color={color} />
      <Corner pos="br" color={color} />
    </>
  );
}

/**
 * The framed window every Level Up surface sits in: dark glass, a thin glowing frame
 * with bright corner brackets, and a bracketed header like a game notification.
 */
export function SystemPanel({ title, children, accent = L.frame, onPress, style, accessibilityLabel }: { title?: string; children: ReactNode; accent?: string; onPress?: () => void; style?: ViewStyle; accessibilityLabel?: string }) {
  const body = (
    <View style={[styles.panel, { borderColor: accent + '66', shadowColor: accent }, style]}>
      <HudCorners color={accent} />
      {title ? (
        <View style={styles.header}>
          <View style={[styles.rule, { backgroundColor: accent + '55' }]} />
          <HudText size={12} color={L.text} weight="700">
            [ {title.toUpperCase()} ]
          </HudText>
          <View style={[styles.rule, { backgroundColor: accent + '55' }]} />
        </View>
      ) : null}
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Thin XP / progress bar with a bright leading edge. */
export function XpBar({ value, color = L.xp, height = 8 }: { value: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={{ height, borderRadius: 2, backgroundColor: L.xpTrack, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: L.panelEdge }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, shadowColor: color, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: L.panel,
    borderWidth: 1,
    borderRadius: 4,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: { shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
      default: { elevation: 6 },
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: 1 },
});
