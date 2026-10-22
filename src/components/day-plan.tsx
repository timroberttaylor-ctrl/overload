import { StyleSheet, Text, View } from 'react-native';

import type { ResolvedSlot } from '@/db/repositories/enrolments';
import { useTheme } from '@/hooks/use-theme';

import { ExerciseDemo } from './exercise-demo';
import { TempoChip } from './tempo-chip';
import { Row, Small } from './ui';

export function repRange(min: number, max: number) {
  return min === max ? `${min}` : `${min}–${max}`;
}

function shownRpe(s: ResolvedSlot): number | null {
  const cap = s.adjust?.rpeCap;
  if (s.targetRpe == null) return cap ?? null;
  return cap == null ? s.targetRpe : Math.min(s.targetRpe, cap);
}

/** Exercises grouped by series letter (A, B, …); a shared letter is a superset. */
export function DayPlanList({ slots, onOpenExercise }: { slots: ResolvedSlot[]; onOpenExercise?: (exerciseId: string) => void }) {
  const t = useTheme();
  const groups = new Map<string, ResolvedSlot[]>();
  for (const s of slots) groups.set(s.slot.series, [...(groups.get(s.slot.series) ?? []), s]);
  return (
    <View style={{ gap: 14 }}>
      {[...groups.entries()].map(([series, items]) => (
        <View key={series} style={styles.group}>
          <View style={styles.rail}>
            <View style={[styles.badge, { backgroundColor: t.accentDim }]}>
              <Text style={[styles.badgeText, { color: t.accent }]}>{series}</Text>
            </View>
            {items.length > 1 ? <View style={[styles.line, { backgroundColor: t.accentDim }]} /> : null}
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            {items.length > 1 ? <Small style={{ color: t.accent, fontWeight: '700' }}>Superset</Small> : null}
            {items.map((s) => (
              <Row key={s.slot.id} gap={10} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <ExerciseDemo exerciseId={s.exercise.id} equipment={s.exercise.equipment} size="sm" onPress={onOpenExercise ? () => onOpenExercise(s.exercise.id) : undefined} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.name, { color: t.text }]}>{s.exercise.name}</Text>
                  <Small>
                    {s.workingSets} × {repRange(s.slot.repMin, s.slot.repMax)}
                    {s.exercise.pattern === 'carry' ? ' m' : ''}
                    {s.slot.warmupSets ? ` · ${s.slot.warmupSets} warm-up` : ''}
                    {shownRpe(s) != null ? ` · RPE ${shownRpe(s)}` : ''}
                    {` · ${Math.round(s.slot.restS / 15) * 15}s rest`}
                  </Small>
                  <TempoChip tempo={s.slot.tempo} />
                  {s.planNote ? <Small style={{ color: t.accent, fontWeight: '700' }}>{s.planNote}</Small> : null}
                  {s.swap ? <Small style={{ color: t.warning }}>Swapped {s.swap.scope === 'program' ? 'for the whole program' : 'for this day'}</Small> : null}
                </View>
              </Row>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 28 },
  badge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontWeight: '900', fontSize: 14 },
  line: { width: 2, flex: 1, marginTop: 4, borderRadius: 1 },
  name: { fontSize: 15, fontWeight: '700' },
});
