import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DayStatus, WeekDay } from '@/db/repositories/sessions';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './ui';

const STATUS_ICON: Partial<Record<DayStatus, IconName>> = {
  done: 'checkmark',
  partial: 'remove',
  rest: 'moon-outline',
  rest_done: 'moon',
  missed: 'close',
};

/** Seven program days of a week; tap to preview a day. */
export function WeekStrip({ days, selected, onSelect }: { days: WeekDay[]; selected: number; onSelect: (programDay: number) => void }) {
  const t = useTheme();
  return (
    <View style={styles.row}>
      {days.map((d) => {
        const isSel = d.programDay === selected;
        const isCurrent = d.status === 'current';
        const done = d.status === 'done' || d.status === 'rest_done';
        const icon = STATUS_ICON[d.status] ?? (d.isRest ? 'moon-outline' : undefined);
        const circleBg = done ? t.accent : d.status === 'partial' ? t.warning : isSel ? t.backgroundSelected : 'transparent';
        const iconColor = done || d.status === 'partial' ? t.accentText : d.status === 'missed' ? t.danger : t.textSecondary;
        return (
          <Pressable
            key={d.programDay}
            onPress={() => onSelect(d.programDay)}
            accessibilityRole="button"
            accessibilityLabel={`Day ${d.programDay + 1}, ${d.isRest ? 'rest' : d.name}, ${d.status.replace('_', ' ')}`}
            accessibilityState={{ selected: isSel }}
            style={styles.cell}>
            <Text style={[styles.label, { color: isSel ? t.text : t.textSecondary }]}>D{d.programDay + 1}</Text>
            <View style={[styles.circle, { backgroundColor: circleBg, borderColor: isSel || isCurrent ? t.accent : t.border }]}>
              {icon ? (
                <Icon name={icon} size={15} color={iconColor} />
              ) : (
                <View style={[styles.dot, { backgroundColor: isCurrent ? t.accent : t.textSecondary }]} />
              )}
            </View>
            <View style={[styles.underline, { backgroundColor: isSel ? t.accent : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 6, flex: 1 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  circle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  underline: { width: 16, height: 3, borderRadius: 2 },
});
