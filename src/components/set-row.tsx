import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KEYBOARD_DONE_ID } from '@/components/keyboard-done';
import { parseWeightInput, weightInputValue, type WeightUnit } from '@/core/units';
import type { SetLog } from '@/db/repositories/sessions';
import { useTheme } from '@/hooks/use-theme';

export type SetValues = { weightKg: number | null; reps: number | null; rpe: number | null };

type Props = {
  set: SetLog;
  label: string;
  unit: WeightUnit;
  /** Player: show the log tick. Review: edits only. */
  mode: 'player' | 'review';
  highlighted?: boolean;
  onSaveDraft: (v: SetValues) => void;
  onToggle?: (v: SetValues) => void;
  onLongPress?: () => void;
};

const parseReps = (t: string) => (t.trim() === '' ? null : Number.isInteger(Number(t)) ? Number(t) : null);
const parseRpe = (t: string) => {
  const v = Number(t.replace(',', '.'));
  return t.trim() === '' || !Number.isFinite(v) ? null : v;
};

/**
 * One set: weight, reps, optional RPE and a tick. Values are pre-filled with the
 * engine's targets, so a set done as planned is a single tap.
 */
export function SetRow({ set, label, unit, mode, highlighted, onSaveDraft, onToggle, onLongPress }: Props) {
  const t = useTheme();
  const [w, setW] = useState(weightInputValue(set.weightKg, unit));
  const [r, setR] = useState(set.reps != null ? String(set.reps) : '');
  const [rpe, setRpe] = useState(set.rpe != null ? String(set.rpe) : '');
  const values = (): SetValues => ({ weightKg: parseWeightInput(w, unit), reps: parseReps(r), rpe: parseRpe(rpe) });
  const save = () => onSaveDraft(values());
  const done = set.completed;
  const input = [styles.input, { color: done ? t.textSecondary : t.text, borderColor: highlighted && !done ? t.accent : 'transparent', backgroundColor: t.backgroundSelected }];

  return (
    <Pressable onLongPress={onLongPress} style={[styles.row, done && { backgroundColor: t.accentDim }]}>
      <View style={[styles.labelChip, { backgroundColor: set.setType === 'warmup' ? t.backgroundSelected : done ? t.accent : t.accentDim }]}>
        <Text style={[styles.label, { color: set.setType === 'warmup' ? t.textSecondary : done ? t.accentText : t.accent }]}>{label}</Text>
      </View>
      <View style={styles.cell}>
        <TextInput value={w} onChangeText={setW} onEndEditing={save} keyboardType="decimal-pad" placeholder={unit} placeholderTextColor={t.textSecondary} style={input} selectTextOnFocus inputAccessoryViewID={KEYBOARD_DONE_ID} accessibilityLabel={`${label} weight`} />
      </View>
      <View style={styles.cellSmall}>
        <TextInput value={r} onChangeText={setR} onEndEditing={save} keyboardType="number-pad" placeholder="reps" placeholderTextColor={t.textSecondary} style={input} selectTextOnFocus inputAccessoryViewID={KEYBOARD_DONE_ID} accessibilityLabel={`${label} reps`} />
      </View>
      <View style={styles.cellSmall}>
        <TextInput value={rpe} onChangeText={setRpe} onEndEditing={save} keyboardType="decimal-pad" placeholder={set.targetRpe != null ? `@${set.targetRpe}` : 'RPE'} placeholderTextColor={t.textSecondary} style={input} selectTextOnFocus inputAccessoryViewID={KEYBOARD_DONE_ID} accessibilityLabel={`${label} RPE`} />
      </View>
      {mode === 'player' ? (
        <Pressable
          onPress={() => onToggle?.(values())}
          accessibilityRole="button"
          accessibilityLabel={done ? `Undo ${label}` : `Log ${label}`}
          style={[styles.tick, { backgroundColor: done ? t.accent : 'transparent', borderColor: done ? t.accent : t.border }]}>
          <Ionicons name="checkmark" size={20} color={done ? t.accentText : t.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 4, borderRadius: 12 },
  labelChip: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '900', textAlign: 'center' },
  cell: { flex: 1.4 },
  cellSmall: { flex: 1 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8, fontSize: 17, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  tick: { width: 44, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
