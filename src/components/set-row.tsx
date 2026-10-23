import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { KEYBOARD_DONE_ID } from '@/components/keyboard-done';
import { parseWeightInput, weightInputValue, type WeightUnit } from '@/core/units';
import type { SetLog } from '@/db/repositories/sessions';
import { useTheme } from '@/hooks/use-theme';
import { useKeyboardAction } from '@/state/keyboard-action';

export type SetValues = { weightKg: number | null; reps: number | null; rpe: number | null };

type Props = {
  set: SetLog;
  label: string;
  unit: WeightUnit;
  /** Player: show the log tick. Review: edits only. */
  mode: 'player' | 'review';
  highlighted?: boolean;
  /** This set beat a record when it was logged */
  pr?: boolean;
  onSaveDraft: (v: SetValues) => void;
  onToggle?: (v: SetValues) => void;
  onLongPress?: () => void;
};

const parseReps = (t: string) => (t.trim() === '' ? null : Number.isInteger(Number(t)) ? Number(t) : null);
const parseRpe = (t: string) => {
  const v = Number(t.replace(',', '.'));
  return t.trim() === '' || !Number.isFinite(v) ? null : v;
};

type Field = 'weight' | 'reps' | 'rpe';

/**
 * One set: weight, reps, optional RPE and a tick. Values are pre-filled with the
 * engine's targets, so a set done as planned is a single tap.
 *
 * Keyboard flow: Enter (Android) or the bar above the number pad (iOS) moves
 * weight → reps → RPE, and Enter on RPE logs the set, same as tapping the tick.
 */
export function SetRow({ set, label, unit, mode, highlighted, pr, onSaveDraft, onToggle, onLongPress }: Props) {
  const t = useTheme();
  const [w, setW] = useState(weightInputValue(set.weightKg, unit));
  const [r, setR] = useState(set.reps != null ? String(set.reps) : '');
  const [rpe, setRpe] = useState(set.rpe != null ? String(set.rpe) : '');
  const values = (): SetValues => ({ weightKg: parseWeightInput(w, unit), reps: parseReps(r), rpe: parseRpe(rpe) });
  const save = () => onSaveDraft(values());
  const done = set.completed;

  const repsRef = useRef<TextInputInstance>(null);
  const rpeRef = useRef<TextInputInstance>(null);
  const setAction = useKeyboardAction((k) => k.setAction);
  const clearAction = useKeyboardAction((k) => k.clearAction);
  const owner = (f: Field) => `${set.id}:${f}`;
  const canLog = mode === 'player' && !done && !!onToggle;
  const logWith = (v: SetValues) => {
    clearAction(owner('rpe'));
    onToggle?.(v);
  };
  // What "Next" / "Log set" does for the focused field (iOS bar); `v` = the values right now.
  const arm = (f: Field, v: SetValues) => {
    if (f === 'weight') setAction({ owner: owner(f), label: 'Next', run: () => repsRef.current?.focus() });
    else if (f === 'reps') setAction({ owner: owner(f), label: 'Next', run: () => rpeRef.current?.focus() });
    else if (canLog) setAction({ owner: owner(f), label: 'Log set', run: () => logWith(v) });
    else clearAction(owner(f));
  };
  const blur = (f: Field) => {
    clearAction(owner(f));
    save();
  };
  const input = [styles.input, { color: done ? t.textSecondary : t.text, borderColor: highlighted && !done ? t.accent : 'transparent', backgroundColor: t.backgroundSelected }];

  return (
    <Pressable onLongPress={onLongPress} style={[styles.row, done && { backgroundColor: t.accentDim }]}>
      <View style={[styles.labelChip, { backgroundColor: set.setType === 'warmup' ? t.backgroundSelected : pr && done ? t.warning : done ? t.accent : t.accentDim }]}>
        {pr && done ? (
          <Ionicons name="trophy" size={15} color={t.accentText} accessibilityLabel="New record" />
        ) : (
          <Text style={[styles.label, { color: set.setType === 'warmup' ? t.textSecondary : done ? t.accentText : t.accent }]}>{label}</Text>
        )}
      </View>
      <View style={styles.cell}>
        <TextInput
          value={w}
          onChangeText={setW}
          onFocus={() => arm('weight', values())}
          onEndEditing={() => blur('weight')}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => repsRef.current?.focus()}
          keyboardType="decimal-pad"
          placeholder={unit}
          placeholderTextColor={t.textSecondary}
          style={input}
          selectTextOnFocus
          inputAccessoryViewID={KEYBOARD_DONE_ID}
          accessibilityLabel={`${label} weight`}
        />
      </View>
      <View style={styles.cellSmall}>
        <TextInput
          ref={repsRef}
          value={r}
          onChangeText={setR}
          onFocus={() => arm('reps', values())}
          onEndEditing={() => blur('reps')}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => rpeRef.current?.focus()}
          keyboardType="number-pad"
          placeholder={set.toFailure ? 'max' : 'reps'}
          placeholderTextColor={t.textSecondary}
          style={input}
          selectTextOnFocus
          inputAccessoryViewID={KEYBOARD_DONE_ID}
          accessibilityLabel={set.toFailure ? `${label} reps, to failure` : `${label} reps`}
        />
      </View>
      <View style={styles.cellSmall}>
        <TextInput
          ref={rpeRef}
          value={rpe}
          onChangeText={(text) => {
            setRpe(text);
            arm('rpe', { ...values(), rpe: parseRpe(text) });
          }}
          onFocus={() => arm('rpe', values())}
          onEndEditing={() => blur('rpe')}
          returnKeyType={canLog ? 'go' : 'done'}
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => (canLog ? logWith(values()) : save())}
          keyboardType="decimal-pad"
          placeholder={set.targetRpe != null ? `@${set.targetRpe}` : 'RPE'}
          placeholderTextColor={t.textSecondary}
          style={input}
          selectTextOnFocus
          inputAccessoryViewID={KEYBOARD_DONE_ID}
          accessibilityLabel={`${label} RPE`}
        />
      </View>
      {mode === 'player' ? (
        <Pressable
          onPress={() => onToggle?.(values())}
          accessibilityRole="button"
          accessibilityLabel={done ? `Undo ${label}` : `Log ${label}`}
          style={[styles.tick, { backgroundColor: done ? t.accent : 'transparent', borderColor: done ? t.accent : t.border }]}
        >
          <Ionicons name="checkmark" size={20} color={done ? t.accentText : t.textSecondary} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 4, borderRadius: 12 },
  labelChip: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  cell: { flex: 1.4 },
  cellSmall: { flex: 1 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8, fontSize: 17, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  tick: { width: 44, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
