import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ExercisePicker } from '@/components/exercise-picker';
import { Body, Button, Card, Field, H2, Icon, Pill, Row, Screen, Small, Toggle } from '@/components/ui';
import { getDb } from '@/db/client';
import { defaultSlot, deleteProgram, draftFromTemplate, emptyDraft, LIMITS, phasesFit, saveProgram, seriesLetters, type DraftDay, type DraftSlot, type ProgramDraft } from '@/db/repositories/builder';
import { getExercise } from '@/db/repositories/exercises';
import type { ProgressionRuleKind } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';

type UiSlot = DraftSlot & { k: string };
type UiDay = Omit<DraftDay, 'slots'> & { k: string; slots: UiSlot[] };
type UiDraft = Omit<ProgramDraft, 'days'> & { days: UiDay[] };

const RULES: { value: ProgressionRuleKind; label: string; hint: string }[] = [
  { value: 'double', label: 'Reps, then load', hint: 'Add reps across the range; when every set hits the top, add weight and start again at the bottom.' },
  { value: 'linear', label: 'Linear', hint: 'Add weight every time all sets are completed at the bottom of the range.' },
  { value: 'rpe', label: 'RPE', hint: 'Weight is set from your recent best so the top set lands at the target RPE.' },
  { value: 'none', label: 'Track only', hint: 'No automatic targets; beat last time if you can.' },
];
const RPES: (number | null)[] = [null, 6, 7, 7.5, 8, 8.5, 9];
const RESTS = [45, 60, 90, 120, 150, 180, 240, 300];
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const t = useTheme();
  const btn = (delta: number, icon: 'remove' | 'add') => {
    const next = Math.min(max, Math.max(min, value + delta));
    return (
      <Pressable
        onPress={() => onChange(next)}
        disabled={next === value}
        accessibilityRole="button"
        accessibilityLabel={`${icon === 'add' ? 'Increase' : 'Decrease'} ${label}`}
        hitSlop={6}
        style={{ width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: t.backgroundSelected, opacity: next === value ? 0.4 : 1 }}
      >
        <Icon name={icon} size={18} color={t.text} />
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 4, minWidth: 96 }}>
      <Small>{label}</Small>
      <Row gap={6} style={{ flexWrap: 'nowrap' }}>
        {btn(-step, 'remove')}
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 16, minWidth: 34, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {value}
          {suffix}
        </Text>
        {btn(step, 'add')}
      </Row>
    </View>
  );
}

function IconBtn({
  icon,
  label,
  onPress,
  disabled,
  color,
}: {
  icon: 'arrow-up' | 'arrow-down' | 'trash-outline' | 'swap-horizontal' | 'chevron-down' | 'chevron-up';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={{ padding: 4, opacity: disabled ? 0.3 : 1 }}>
      <Icon name={icon} size={18} color={color ?? t.textSecondary} />
    </Pressable>
  );
}

const move = <T,>(xs: T[], i: number, d: number): T[] => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

/** Create a program (no id) or edit one of your own (`?id=`). */
export default function ProgramBuilderScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const counter = useRef(0);
  const key = () => `k${++counter.current}`;
  const [draft, setDraft] = useState<UiDraft>(() => {
    const d = id ? draftFromTemplate(getDb(), id) : emptyDraft();
    let n = 0;
    return { ...d, days: d.days.map((day) => ({ ...day, k: `i${n++}`, slots: day.slots.map((s) => ({ ...s, k: `i${n++}` })) })) };
  });
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ dayK: string; replaceK?: string } | null>(null);

  const set = (patch: Partial<UiDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setDays = (fn: (days: UiDay[]) => UiDay[]) => setDraft((d) => ({ ...d, days: fn(d.days) }));
  const updateDay = (dk: string, patch: Partial<UiDay>) => setDays((days) => days.map((x) => (x.k === dk ? { ...x, ...patch } : x)));
  const updateSlots = (dk: string, fn: (slots: UiSlot[]) => UiSlot[]) => setDays((days) => days.map((x) => (x.k === dk ? { ...x, slots: fn(x.slots) } : x)));
  const updateSlot = (dk: string, sk: string, patch: Partial<UiSlot>) => updateSlots(dk, (slots) => slots.map((s) => (s.k === sk ? { ...s, ...patch } : s)));

  const save = () => {
    try {
      const newId = saveProgram(getDb(), draft, id);
      if (id) router.back();
      else router.replace({ pathname: '/program/[id]', params: { id: newId } });
    } catch (e) {
      Alert.alert('Program', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert('Delete program?', 'Workouts you logged with it stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            deleteProgram(getDb(), id!);
            router.dismissTo('/programs');
          } catch (e) {
            Alert.alert('Program', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  const training = draft.days.filter((d) => !d.isRest).length;

  return (
    <Screen edges={[]}>
      <Stack.Screen
        options={{
          title: id ? 'Edit program' : 'New program',
          headerRight: () => (
            <Pressable onPress={save} accessibilityRole="button" hitSlop={10}>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: 16 }}>Save</Text>
            </Pressable>
          ),
        }}
      />

      {/* Basics */}
      <Card>
        <H2>Basics</H2>
        <Field value={draft.name} onChangeText={(v) => set({ name: v })} placeholder="Program name" maxLength={LIMITS.name} />
        <Field value={draft.summary} onChangeText={(v) => set({ summary: v })} placeholder="Short description (optional)" maxLength={LIMITS.summary} />
        <Row gap={18}>
          <Stepper label="Weeks" value={draft.weeks} min={1} max={16} onChange={(v) => set({ weeks: v })} />
          <Stepper label="Minutes per session" value={draft.minutes} min={15} max={180} step={15} onChange={(v) => set({ minutes: v })} />
        </Row>
        <Row gap={8}>
          {LEVELS.map((l) => (
            <Pill key={l} label={l} active={draft.level === l} onPress={() => set({ level: l })} />
          ))}
        </Row>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <View style={{ flex: 1 }}>
            <Body>Deload in the last week</Body>
            <Small>Half the sets, about 90% loads, RPE 6. Recommended for programs of 4+ weeks.</Small>
          </View>
          <Toggle value={draft.deloadLastWeek} onValueChange={(v) => set({ deloadLastWeek: v })} label="Deload in the last week" />
        </Row>
        {draft.phases && draft.phases.length > 1 ? (
          <Small style={{ color: phasesFit(draft) ? t.textSecondary : t.warning }}>
            {phasesFit(draft)
              ? `Keeps the original ${draft.phases.length} phases (build, intensify, peak, deload).`
              : 'Changing the length or deload replaces the original phases with build weeks plus an optional deload.'}
          </Small>
        ) : null}
      </Card>

      <Small>
        {draft.days.length}-day cycle · {training} training day{training === 1 ? '' : 's'}. The cycle repeats for {draft.weeks} week{draft.weeks === 1 ? '' : 's'}; use 7 days to line it up with the
        calendar.
      </Small>

      {/* Days */}
      {draft.days.map((day, di) => {
        const letters = seriesLetters(day.slots);
        return (
          <Card key={day.k} raised={!day.isRest}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>DAY {di + 1}</Text>
              <Row gap={2} style={{ flexWrap: 'nowrap' }}>
                <IconBtn icon="arrow-up" label={`Move day ${di + 1} up`} disabled={di === 0} onPress={() => setDays((d) => move(d, di, -1))} />
                <IconBtn icon="arrow-down" label={`Move day ${di + 1} down`} disabled={di === draft.days.length - 1} onPress={() => setDays((d) => move(d, di, 1))} />
                <IconBtn icon="trash-outline" label={`Remove day ${di + 1}`} disabled={draft.days.length === 1} color={t.danger} onPress={() => setDays((d) => d.filter((x) => x.k !== day.k))} />
              </Row>
            </Row>
            <Field value={day.name} onChangeText={(v) => updateDay(day.k, { name: v })} placeholder={day.isRest ? 'Rest' : `Day ${di + 1} name, e.g. Upper A`} maxLength={40} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Body>Rest day</Body>
              <Toggle value={day.isRest} onValueChange={(v) => updateDay(day.k, { isRest: v })} label={`Day ${di + 1} is a rest day`} />
            </Row>

            {!day.isRest ? (
              <View style={{ gap: 10 }}>
                {day.slots.map((s, si) => {
                  const ex = getExercise(getDb(), s.exerciseId);
                  const open = openSlot === s.k;
                  const rule = RULES.find((r) => r.value === s.rule)!;
                  return (
                    <View key={s.k} style={{ borderRadius: 12, backgroundColor: t.backgroundSelected, padding: 10, gap: 10 }}>
                      <Pressable onPress={() => setOpenSlot(open ? null : s.k)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                        <Row gap={10} style={{ flexWrap: 'nowrap' }}>
                          <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: t.accentDim, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: t.accent, fontWeight: '900' }}>{letters[si]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: t.text, fontWeight: '700' }}>{ex?.name ?? 'Missing exercise'}</Text>
                            <Small>
                              {s.sets} × {s.repMin === s.repMax ? s.repMin : `${s.repMin}–${s.repMax}`}
                              {ex?.pattern === 'carry' ? ' m' : ''} · {rule.label}
                              {s.targetRpe != null ? ` · RPE ${s.targetRpe}` : ''} · {s.restS}s rest
                              {s.supersetWithPrevious && si > 0 ? ' · superset' : ''}
                            </Small>
                          </View>
                          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.textSecondary} />
                        </Row>
                      </Pressable>

                      {open ? (
                        <View style={{ gap: 12 }}>
                          <Row gap={14}>
                            <Stepper label="Sets" value={s.sets} min={1} max={10} onChange={(v) => updateSlot(day.k, s.k, { sets: v })} />
                            <Stepper label="Rep min" value={s.repMin} min={1} max={100} onChange={(v) => updateSlot(day.k, s.k, { repMin: v, repMax: Math.max(v, s.repMax) })} />
                            <Stepper label="Rep max" value={s.repMax} min={1} max={100} onChange={(v) => updateSlot(day.k, s.k, { repMax: v, repMin: Math.min(v, s.repMin) })} />
                            <Stepper label="Warm-up sets" value={s.warmupSets} min={0} max={4} onChange={(v) => updateSlot(day.k, s.k, { warmupSets: v })} />
                          </Row>
                          <View style={{ gap: 6 }}>
                            <Small>Progression</Small>
                            <Row gap={8}>
                              {RULES.map((r) => (
                                <Pill
                                  key={r.value}
                                  label={r.label}
                                  active={s.rule === r.value}
                                  onPress={() => updateSlot(day.k, s.k, { rule: r.value, targetRpe: r.value === 'rpe' && s.targetRpe == null ? 8 : s.targetRpe })}
                                />
                              ))}
                            </Row>
                            <Small>{rule.hint}</Small>
                          </View>
                          <View style={{ gap: 6 }}>
                            <Small>Target RPE (effort: 10 = nothing left)</Small>
                            <Row gap={8}>
                              {RPES.map((r) => (
                                <Pill key={String(r)} label={r == null ? 'None' : String(r)} active={s.targetRpe === r} onPress={() => updateSlot(day.k, s.k, { targetRpe: r })} />
                              ))}
                            </Row>
                          </View>
                          <View style={{ gap: 6 }}>
                            <Small>Rest after each set</Small>
                            <Row gap={8}>
                              {RESTS.map((r) => (
                                <Pill key={r} label={r >= 60 && r % 60 === 0 ? `${r / 60} min` : `${r}s`} active={s.restS === r} onPress={() => updateSlot(day.k, s.k, { restS: r })} />
                              ))}
                            </Row>
                          </View>
                          <View style={{ gap: 6 }}>
                            <Small>Reps per set (optional): e.g. 12,10,8,8 · F = to failure · rotate weekly with |, e.g. 10,10,10,10 | 12,10,8,8</Small>
                            <Field
                              value={s.repScheme ?? ''}
                              onChangeText={(v) => updateSlot(day.k, s.k, { repScheme: v || null })}
                              placeholder={`e.g. ${Array.from({ length: s.sets }, (_, i) => (i === s.sets - 1 ? 'F' : String(s.repMax))).join(',')}`}
                              autoCapitalize="characters"
                              autoCorrect={false}
                              maxLength={120}
                            />
                          </View>
                          <View style={{ gap: 6 }}>
                            <Small>Tempo (optional): down / pause / up / pause in seconds, X = explosive</Small>
                            <Field
                              value={s.tempo ?? ''}
                              onChangeText={(v) => updateSlot(day.k, s.k, { tempo: v || null })}
                              placeholder="e.g. 3/1/X/1"
                              autoCapitalize="characters"
                              autoCorrect={false}
                              maxLength={11}
                            />
                          </View>
                          {si > 0 ? (
                            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                              <View style={{ flex: 1 }}>
                                <Body>Superset with the exercise above</Body>
                                <Small>Alternate them with no rest in between.</Small>
                              </View>
                              <Toggle value={s.supersetWithPrevious} onValueChange={(v) => updateSlot(day.k, s.k, { supersetWithPrevious: v })} label="Superset with the exercise above" />
                            </Row>
                          ) : null}
                          <Row gap={4} style={{ justifyContent: 'flex-end' }}>
                            <Button compact variant="secondary" icon="swap-horizontal" title="Change exercise" onPress={() => setPicker({ dayK: day.k, replaceK: s.k })} />
                            <IconBtn icon="arrow-up" label="Move exercise up" disabled={si === 0} onPress={() => updateSlots(day.k, (xs) => move(xs, si, -1))} />
                            <IconBtn icon="arrow-down" label="Move exercise down" disabled={si === day.slots.length - 1} onPress={() => updateSlots(day.k, (xs) => move(xs, si, 1))} />
                            <IconBtn icon="trash-outline" label="Remove exercise" color={t.danger} onPress={() => updateSlots(day.k, (xs) => xs.filter((x) => x.k !== s.k))} />
                          </Row>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <Button compact variant="ghost" icon="add" title="Add exercise" onPress={() => setPicker({ dayK: day.k })} />
              </View>
            ) : (
              <Small>Recovery day. It still counts as a day in the cycle.</Small>
            )}
          </Card>
        );
      })}

      <Row>
        <Button
          compact
          variant="secondary"
          icon="add"
          title="Training day"
          disabled={draft.days.length >= 14}
          onPress={() => setDays((d) => [...d, { k: key(), name: `Day ${d.length + 1}`, isRest: false, slots: [] }])}
        />
        <Button
          compact
          variant="secondary"
          icon="moon-outline"
          title="Rest day"
          disabled={draft.days.length >= 14}
          onPress={() => setDays((d) => [...d, { k: key(), name: 'Rest', isRest: true, slots: [] }])}
        />
      </Row>

      <Button title={id ? 'Save changes' : 'Create program'} icon="checkmark" onPress={save} />
      {id ? <Button title="Delete program" variant="ghost" onPress={remove} /> : null}
      {id ? <Small>Changes apply to upcoming workouts. Exercises you keep carry their history and progression with them.</Small> : null}

      <ExercisePicker
        visible={!!picker}
        title={picker?.replaceK ? 'Change exercise' : 'Add exercise'}
        onClose={() => setPicker(null)}
        onPick={(ex) => {
          const p = picker!;
          setPicker(null);
          if (p.replaceK) updateSlot(p.dayK, p.replaceK, { exerciseId: ex.id });
          else {
            const k = key();
            updateSlots(p.dayK, (xs) => [...xs, { ...defaultSlot(ex), k }]);
            setOpenSlot(k);
          }
        }}
      />
    </Screen>
  );
}
