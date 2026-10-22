import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';

import { Body, Button, Card, Field, H2, Pill, Row, Screen, Small, Toggle } from '@/components/ui';
import { getDb } from '@/db/client';
import { createCustomExercise, deleteCustomExercise, getExercise, listEquipment, listMuscles, updateCustomExercise, type NewCustomExercise } from '@/db/repositories/exercises';
import type { MovementPattern } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';
import { parseMuscles } from '@/core/json';

const PATTERNS: { value: MovementPattern; label: string }[] = [
  { value: 'squat', label: 'Squat' },
  { value: 'hinge', label: 'Hinge' },
  { value: 'lunge', label: 'Lunge / single leg' },
  { value: 'push_h', label: 'Horizontal push' },
  { value: 'push_v', label: 'Vertical push' },
  { value: 'pull_h', label: 'Horizontal pull' },
  { value: 'pull_v', label: 'Vertical pull' },
  { value: 'isolation', label: 'Isolation' },
  { value: 'core', label: 'Core' },
  { value: 'carry', label: 'Carry' },
];

const STEPS = [0, 1, 1.25, 2, 2.5, 5];
const ISOLATED: MovementPattern[] = ['isolation', 'core'];

const EMPTY: NewCustomExercise = {
  name: '',
  primaryMuscle: '',
  secondaryMuscles: [],
  equipment: '',
  pattern: 'isolation',
  isCompound: false,
  defaultIncrementKg: 2.5,
  cues: '',
};

/** Create a new custom exercise, or edit one (`?id=`). */
export default function EditExerciseScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data] = useDbQuery((db) => ({
    existing: id ? getExercise(db, id) : undefined,
    muscles: listMuscles(db),
    equipment: listEquipment(db),
  }));
  const ex = data.existing;
  const [form, setForm] = useState<NewCustomExercise | null>(null);
  const f: NewCustomExercise =
    form ??
    (ex
      ? {
          name: ex.name,
          primaryMuscle: ex.primaryMuscle,
          secondaryMuscles: parseMuscles(ex.secondaryMuscles),
          equipment: ex.equipment,
          pattern: ex.pattern,
          isCompound: ex.isCompound,
          defaultIncrementKg: ex.defaultIncrementKg,
          cues: ex.cues,
        }
      : EMPTY);
  const set = (patch: Partial<NewCustomExercise>) => setForm({ ...f, ...patch });
  const secondary = f.secondaryMuscles ?? [];

  if (id && ex && !ex.isCustom) {
    return (
      <Screen edges={[]}>
        <Body muted>Built-in exercises can&apos;t be edited. Create your own version instead.</Body>
      </Screen>
    );
  }

  const save = () => {
    try {
      const saved = id ? updateCustomExercise(getDb(), id, f) : createCustomExercise(getDb(), f);
      if (id) router.back();
      else
        router.replace({
          pathname: '/exercise/[id]',
          params: { id: saved.id },
        });
    } catch (e) {
      Alert.alert('Exercise', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert('Delete exercise?', 'It disappears from the library. Workouts you already logged with it are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            deleteCustomExercise(getDb(), id!);
            router.dismissTo('/library');
          } catch (e) {
            Alert.alert('Exercise', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: id ? 'Edit exercise' : 'New exercise' }} />

      <Card>
        <H2>Name</H2>
        <Field value={f.name} onChangeText={(v) => set({ name: v })} placeholder="e.g. Landmine press" maxLength={60} />
      </Card>

      <Card>
        <H2>Main muscle</H2>
        <Row gap={8}>
          {data.muscles.map((m) => (
            <Pill
              key={m}
              label={m}
              active={f.primaryMuscle === m}
              onPress={() =>
                set({
                  primaryMuscle: m,
                  secondaryMuscles: secondary.filter((x) => x !== m),
                })
              }
            />
          ))}
        </Row>
        <Body style={{ fontWeight: '700', marginTop: 4 }}>Also works (optional)</Body>
        <Row gap={8}>
          {data.muscles
            .filter((m) => m !== f.primaryMuscle)
            .map((m) => (
              <Pill
                key={m}
                label={m}
                active={secondary.includes(m)}
                onPress={() =>
                  set({
                    secondaryMuscles: secondary.includes(m) ? secondary.filter((x) => x !== m) : [...secondary, m],
                  })
                }
              />
            ))}
        </Row>
      </Card>

      <Card>
        <H2>Equipment</H2>
        <Row gap={8}>
          {data.equipment.map((e) => (
            <Pill key={e} label={e} active={f.equipment === e} onPress={() => set({ equipment: e })} />
          ))}
        </Row>
      </Card>

      <Card>
        <H2>Movement</H2>
        <Small>Used to suggest swaps and to apply joint-pain adjustments.</Small>
        <Row gap={8}>
          {PATTERNS.map((p) => (
            <Pill
              key={p.value}
              label={p.label}
              active={f.pattern === p.value}
              onPress={() =>
                set({
                  pattern: p.value,
                  isCompound: ISOLATED.includes(p.value) ? false : ISOLATED.includes(f.pattern) ? true : f.isCompound,
                })
              }
            />
          ))}
        </Row>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <View style={{ flex: 1 }}>
            <Body>Main lift (compound)</Body>
            <Small>Counts toward strength trends in the week review. Push weeks add sets to non-main lifts.</Small>
          </View>
          <Toggle value={!!f.isCompound} onValueChange={(v) => set({ isCompound: v })} />
        </Row>
      </Card>

      <Card>
        <H2>Load step</H2>
        <Small>How much weight goes on when you progress. Use 0 for bodyweight moves you make harder another way.</Small>
        <Row gap={8}>
          {STEPS.map((s) => (
            <Pill key={s} label={`${s} kg`} active={f.defaultIncrementKg === s} onPress={() => set({ defaultIncrementKg: s })} />
          ))}
        </Row>
      </Card>

      <Card>
        <H2>Cues (optional)</H2>
        <TextInput
          value={f.cues}
          onChangeText={(v) => set({ cues: v })}
          placeholder="What to focus on, in your own words"
          placeholderTextColor={t.textSecondary}
          multiline
          style={{
            minHeight: 80,
            color: t.text,
            backgroundColor: t.backgroundSelected,
            borderRadius: 10,
            padding: 12,
            textAlignVertical: 'top',
          }}
        />
      </Card>

      <Button title={id ? 'Save changes' : 'Create exercise'} icon="checkmark" onPress={save} disabled={!f.name.trim() || !f.primaryMuscle || !f.equipment} />
      {id ? <Button title="Delete exercise" variant="ghost" onPress={remove} /> : null}
    </Screen>
  );
}
