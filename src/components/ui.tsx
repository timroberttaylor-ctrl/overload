import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KEYBOARD_DONE_ID } from '@/components/keyboard-done';
import { HudCorners, MONO } from '@/components/level/system-panel';
import { Radius, Spacing } from '@/constants/theme';
import { useHud, useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

export function Screen({ children, scroll = true, edges = ['top'], padded = true }: { children: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[]; padded?: boolean }) {
  const t = useTheme();
  const style = [padded ? styles.content : styles.contentFlush];
  const body = scroll ? (
    <ScrollView contentContainerStyle={style} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[style, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.background }}>
      {body}
    </SafeAreaView>
  );
}

/** Small uppercase label above a title, e.g. "WEEK 2 · DAY 9". */
export function Eyebrow({ children, color, style }: { children: ReactNode; color?: string; style?: TextStyle }) {
  const t = useTheme();
  const hud = useHud();
  return (
    <Text style={[styles.eyebrow, { color: color ?? t.textSecondary }, hud && styles.hudEyebrow, style]}>
      {hud ? '◆ ' : null}
      {children}
    </Text>
  );
}

export function Display({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const t = useTheme();
  const hud = useHud();
  return <Text style={[styles.display, { color: t.text }, hud && glow(t.accent), style]}>{children}</Text>;
}

export function H1({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const t = useTheme();
  const hud = useHud();
  return <Text style={[styles.h1, { color: t.text }, hud && glow(t.accent), style]}>{children}</Text>;
}

export function H2({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const t = useTheme();
  const hud = useHud();
  return <Text style={[styles.h2, { color: t.text }, hud && styles.hudH2, style]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.textSecondary : t.text }, style]}>{children}</Text>;
}

export function Small({ children, muted = true, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[styles.small, { color: muted ? t.textSecondary : t.text }, style]}>{children}</Text>;
}

export function Card({ children, onPress, style, raised }: { children: ReactNode; onPress?: () => void; style?: ViewStyle; raised?: boolean }) {
  const t = useTheme();
  const hud = useHud();
  const base = [styles.card, { backgroundColor: raised ? t.surfaceRaised : t.backgroundElement, borderColor: t.border }, hud && [styles.hudCard, { borderColor: t.accent + '38' }], style];
  const corners = hud ? <HudCorners color={t.accent} /> : null;
  if (!onPress)
    return (
      <View style={base}>
        {corners}
        {children}
      </View>
    );
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.75 }]} accessibilityRole="button">
      {corners}
      {children}
    </Pressable>
  );
}

/** Tappable list row with an optional leading icon and trailing chevron. */
export function ListRow({ title, subtitle, icon, leading, onPress, right }: { title: string; subtitle?: string; icon?: IconName; leading?: ReactNode; onPress?: () => void; right?: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.listRow, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
    >
      {leading ?? null}
      {!leading && icon ? (
        <View style={[styles.listIcon, { backgroundColor: t.backgroundSelected }]}>
          <Icon name={icon} size={18} color={t.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.body, { color: t.text, fontWeight: '600' }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Small>{subtitle}</Small> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={t.textSecondary} /> : null)}
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  icon,
  compact,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: IconName;
  compact?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const hud = useHud();
  const bg = variant === 'primary' ? t.accent : variant === 'danger' ? t.danger : variant === 'secondary' ? t.backgroundSelected : 'transparent';
  const fg = variant === 'primary' ? t.accentText : variant === 'danger' ? '#fff' : variant === 'ghost' ? t.accent : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: hud ? t.accent + '55' : t.border },
        hud && styles.hudButton,
        hud && variant === 'primary' && { shadowColor: t.accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={compact ? 16 : 18} color={fg} /> : null}
      <Text style={[styles.buttonText, compact && { fontSize: 14 }, { color: fg }, hud && styles.hudButtonText, hud && compact && { fontSize: 12 }]}>{title}</Text>
    </Pressable>
  );
}

export function Pill({ label, active, onPress, icon, dot }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName; dot?: string }) {
  const t = useTheme();
  const hud = useHud();
  const bg = active ? (dot ?? t.accent) : t.backgroundSelected;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!active }}
      style={[styles.pill, { backgroundColor: bg }, hud && { borderRadius: 4 }]}
    >
      {icon ? <Icon name={icon} size={13} color={active ? t.accentText : t.textSecondary} /> : null}
      {dot && !active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={[styles.pillText, { color: active ? t.accentText : t.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Small outlined tag, e.g. muscle groups or a level. `code` gives it a colour-code instead of a tone. */
export function Tag({ label, tone = 'neutral', code }: { label: string; tone?: 'neutral' | 'accent' | 'warning'; code?: { solid: string; text: string; tint: string } }) {
  const t = useTheme();
  const color = tone === 'accent' ? t.accent : tone === 'warning' ? t.warning : t.textSecondary;
  const border = code ? code.solid + '66' : color + '66';
  const bg = code ? code.tint : tone === 'neutral' ? 'transparent' : color + '1A';
  return (
    <View style={[styles.tag, { borderColor: border, backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: code ? code.text : color }]}>{label}</Text>
    </View>
  );
}

const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);

export function Field(props: TextInputProps) {
  const t = useTheme();
  const hud = useHud();
  // iOS number pads have no Return key: attach the shared "Done" bar so the keyboard can be closed.
  const accessory = props.keyboardType && NUMERIC_KEYBOARDS.has(props.keyboardType) ? KEYBOARD_DONE_ID : undefined;
  return <TextInput placeholderTextColor={t.textSecondary} inputAccessoryViewID={accessory} {...props} style={[styles.field, { color: t.text, borderColor: t.border, backgroundColor: t.backgroundElement }, hud && { borderRadius: 4, borderColor: t.accent + '44' }, props.style]} />;
}

export function Row({ children, gap = Spacing.two, style }: { children: ReactNode; gap?: number; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: 'wrap' }, style]}>{children}</View>;
}

/** Big number with a caption, used in stat strips. */
export function Stat({ value, label, align = 'center' }: { value: string; label: string; align?: 'center' | 'left' }) {
  const t = useTheme();
  const hud = useHud();
  return (
    <View style={{ flex: 1, alignItems: align === 'center' ? 'center' : 'flex-start', gap: 2 }}>
      <Text style={[styles.statValue, { color: t.text }, hud && { fontFamily: MONO }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textSecondary }, hud && { fontFamily: MONO }]}>{label}</Text>
    </View>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.statStrip, { borderColor: t.border }]}>{children}</View>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />;
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const t = useTheme();
  const hud = useHud();
  const c = color ?? t.accent;
  return (
    <View style={[styles.track, { backgroundColor: t.backgroundSelected }, hud && { borderRadius: 1 }]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: c }, hud && { borderRadius: 1, shadowColor: c, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: Spacing.two }}>
      <H2>{title}</H2>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
          <Text style={{ color: t.accent, fontWeight: '700', fontSize: 14 }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, backgroundColor: t.background }}>
      <ActivityIndicator color={t.accent} />
      {label ? <Small>{label}</Small> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six + 24 },
  contentFlush: { gap: Spacing.three, paddingBottom: Spacing.six + 24 },
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
  display: { fontSize: 34, fontWeight: '700', lineHeight: 38, letterSpacing: -0.5 },
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  listIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  button: { borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonCompact: { paddingVertical: 9, paddingHorizontal: 14 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pill: { borderRadius: Radius.pill, paddingVertical: 7, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillText: { fontSize: 13, fontWeight: '600' },
  tag: { borderRadius: Radius.pill, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 9 },
  tagText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  field: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  statValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  statStrip: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, marginTop: Spacing.one },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  // Level Up mode (HUD) overrides
  hudEyebrow: { fontFamily: MONO, letterSpacing: 2 },
  hudH2: { fontFamily: MONO, fontSize: 15, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  hudCard: { borderRadius: 4, borderWidth: 1 },
  hudButton: { borderRadius: 4 },
  hudButtonText: { fontFamily: MONO, fontSize: 14, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
});

/** Soft neon glow on headings in Level Up mode. */
function glow(color: string): TextStyle {
  return { textShadowColor: color + 'AA', textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } };
}

/** On/off switch in the app's green instead of the platform default. */
export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label?: string }) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      trackColor={{ false: t.border, true: t.accent + '88' }}
      thumbColor={value ? t.accent : t.textSecondary}
      ios_backgroundColor={t.border}
    />
  );
}
