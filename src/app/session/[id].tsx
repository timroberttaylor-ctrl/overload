import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Keyboard, Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';
import { RestTimer } from '@/components/rest-timer';
import { SetRow, type SetValues } from '@/components/set-row';
import { NoteSheet } from '@/components/note-sheet';
import { SwapSheet } from '@/components/swap-sheet';
import { TempoChip } from '@/components/tempo-chip';
import { Body, Button, Card, Eyebrow, H2, Icon, ProgressBar, Row, Small } from '@/components/ui';
import { isoDate } from '@/core/dates';
import { formatWeight } from '@/core/units';
import { getDb } from '@/db/client';
import { getSettings } from '@/db/repositories/settings';
import {
  addSet,
  discardSession,
  finishSession,
  getSessionDetail,
  logSet,
  removeSet,
  sessionCounts,
  setSessionNote,
  setSetNote,
  swapInSession,
  unlogSet,
  updateSet,
  type ExerciseGroup,
  type SetLog,
} from '@/db/repositories/sessions';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

function Elapsed({ since }: { since: number }) {
  const t = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return (
    <Text
      style={{
        color: t.textSecondary,
        fontVariant: ['tabular-nums'],
        fontWeight: '600',
      }}
    >{`${h ? `${h}:` : ''}${m}:${String(s % 60).padStart(2, '0')}`}</Text>
  );
}

const cardKey = (g: ExerciseGroup) => `${g.exerciseOrder}:${g.exercise.id}`;

function setLabels(sets: SetLog[]): string[] {
  let n = 0;
  return sets.map((s) => (s.setType === 'warmup' ? 'W' : String(++n)));
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [data, refresh] = useDbQuery((db) => ({
    detail: getSessionDetail(db, id),
    settings: getSettings(db),
  }));
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<ExerciseGroup | null>(null);
  /** Which note is being written: a set (by id) or the whole workout */
  const [noteFor, setNoteFor] = useState<{ kind: 'set'; set: SetLog; title: string } | { kind: 'session' } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const cardY = useRef(new Map<string, number>());
  /** Card to bring into view when the rest timer ends (auto-advance after rest) */
  const pendingScroll = useRef<string | null>(null);
  const scrollToCard = useCallback((key: string) => {
    const y = cardY.current.get(key);
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);
  const endRest = useCallback(() => {
    setRestEndsAt(null);
    const key = pendingScroll.current;
    pendingScroll.current = null;
    if (key) scrollToCard(key);
  }, [scrollToCard]);
  const onRestDone = endRest;

  if (!data?.detail) return null;
  const { detail, settings } = data;
  const { session, groups } = detail;
  const unit = settings.units;
  const live = session.status === 'in_progress';
  const counts = sessionCounts(detail);
  const allSets = groups.flatMap((g) => g.sets);
  const nextSetId = allSets.find((s) => !s.completed)?.id;
  const nextGroup = groups.find((g) => g.sets.some((s) => s.id === nextSetId));
  const nextLabel = nextGroup ? `${nextGroup.exercise.name} · set ${setLabels(nextGroup.sets)[nextGroup.sets.findIndex((s) => s.id === nextSetId)]}` : undefined;

  const guard = (label: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      Alert.alert(label, e instanceof Error ? e.message : String(e));
    }
    refresh();
  };

  const toggle = (group: ExerciseGroup, set: SetLog, v: SetValues) =>
    guard('Log set', () => {
      Keyboard.dismiss();
      if (set.completed) return unlogSet(getDb(), set.id);
      if (v.weightKg == null || v.reps == null) throw new Error('Enter a weight (0 for bodyweight) and reps first');
      logSet(getDb(), set.id, {
        weightKg: v.weightKg,
        reps: v.reps,
        rpe: v.rpe,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      // Rest only after the last exercise of a superset round
      const idx = groups.indexOf(group);
      const nextInSeries = groups.slice(idx + 1).find((g) => g.series && g.series === group.series && g.sets.some((s) => !s.completed));
      const restS = nextInSeries ? 0 : (set.restS ?? group.restS);
      setRestEndsAt(restS > 0 ? Date.now() + restS * 1000 : null);
      // Auto-advance: bring the next exercise into view once this one is finished.
      const next = allSets.find((x) => !x.completed && x.id !== set.id);
      const nextGroup = next ? groups.find((g) => g.sets.some((x) => x.id === next.id)) : undefined;
      pendingScroll.current = null;
      if (nextGroup && nextGroup !== group) {
        const key = cardKey(nextGroup);
        if (settings.autoAdvanceAfterLog || restS === 0) {
          if (settings.autoAdvanceAfterLog || settings.autoAdvanceAfterRest) setTimeout(() => scrollToCard(key), 150);
        } else if (settings.autoAdvanceAfterRest) pendingScroll.current = key;
      }
    });

  const saveDraft = (set: SetLog, v: SetValues) =>
    guard('Save', () => {
      if (v.weightKg === set.weightKg && v.reps === set.reps && v.rpe === set.rpe) return;
      updateSet(getDb(), set.id, v);
    });

  const finish = () => {
    const go = () =>
      guard('Finish workout', () => {
        finishSession(getDb(), session.id);
        router.replace({
          pathname: '/session/summary',
          params: { id: session.id },
        });
      });
    const missing = counts.planned - counts.done;
    if (missing > 0) {
      Alert.alert('Finish workout?', `${missing} planned set${missing === 1 ? ' is' : 's are'} not logged. The workout will be saved as partial.`, [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Finish', onPress: go },
      ]);
    } else go();
  };

  const discard = () =>
    Alert.alert('Discard workout?', 'Nothing from this workout will be saved, and the program will not move on.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () =>
          guard('Discard', () => {
            discardSession(getDb(), session.id);
            router.back();
          }),
      },
    ]);

  const setMenu = (set: SetLog, title: string) =>
    Alert.alert('Set', undefined, [
      { text: set.note ? 'Edit note' : 'Add note', onPress: () => setNoteFor({ kind: 'set', set, title }) },
      {
        text: 'Remove this set',
        style: 'destructive',
        onPress: () => guard('Remove set', () => removeSet(getDb(), set.id)),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: () => (live && !session.isBackfill ? <Elapsed since={session.startedAt} /> : null),
        }}
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Eyebrow color={live ? t.accent : t.textSecondary}>
              {live ? (session.isBackfill ? `Logging a past workout · ${session.date}` : 'In progress') : `${session.status} · ${session.date}${session.isBackfill ? ' · logged later' : ''}`}
            </Eyebrow>
            {live ? (
              <Pressable onPress={discard} accessibilityRole="button" hitSlop={8}>
                <Small style={{ color: t.danger, fontWeight: '700' }}>Discard</Small>
              </Pressable>
            ) : null}
          </Row>
          <ProgressBar value={counts.planned ? counts.done / counts.planned : 0} />
          <Small>
            {counts.done} of {counts.planned} working sets
          </Small>
        </View>

        {groups.map((g) => {
          const labels = setLabels(g.sets);
          return (
            <View key={cardKey(g)} onLayout={(e: LayoutChangeEvent) => cardY.current.set(cardKey(g), e.nativeEvent.layout.y)}>
              <Card>
                <Row
                  style={{
                    justifyContent: 'space-between',
                    flexWrap: 'nowrap',
                  }}
                >
                  <Row gap={10} style={{ flex: 1, flexWrap: 'nowrap' }}>
                    <ExerciseDemo
                      exerciseId={g.exercise.id}
                      size="sm"
                      onPress={() =>
                        router.push({
                          pathname: '/exercise/[id]',
                          params: { id: g.exercise.id },
                        })
                      }
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Row gap={6} style={{ flexWrap: 'nowrap' }}>
                        {g.series ? (
                          <View
                            style={{
                              minWidth: 22,
                              height: 22,
                              borderRadius: 6,
                              backgroundColor: t.accentDim,
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: t.accent,
                                fontWeight: '900',
                                fontSize: 12,
                              }}
                            >
                              {g.series}
                            </Text>
                          </View>
                        ) : null}
                        <H2 style={{ flex: 1 }}>{g.exercise.name}</H2>
                      </Row>
                      <TempoChip tempo={g.tempo} />
                    </View>
                  </Row>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/exercise/[id]',
                        params: { id: g.exercise.id },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel="Exercise info"
                    hitSlop={6}
                    style={{ padding: 4 }}
                  >
                    <Icon name="information-circle-outline" size={22} color={t.textSecondary} />
                  </Pressable>
                  {live ? (
                    <Pressable onPress={() => setSwapFor(g)} accessibilityRole="button" accessibilityLabel="Swap exercise" hitSlop={6} style={{ padding: 4 }}>
                      <Icon name="swap-horizontal" size={22} color={t.accent} />
                    </Pressable>
                  ) : null}
                </Row>
                {g.note && live ? (
                  <Row gap={6} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <Icon name="trending-up" size={16} color={t.accent} />
                    <Body muted style={{ flex: 1, fontSize: 13 }}>
                      {g.note}
                    </Body>
                  </Row>
                ) : null}
                {g.lastNotes.length ? (
                  <View style={{ gap: 2, padding: 8, borderRadius: 8, backgroundColor: t.warning + '1A' }}>
                    <Small style={{ color: t.warning, fontWeight: '700' }}>Your note from {g.lastNotes[0].date}</Small>
                    {g.lastNotes.map((n, i) => (
                      <Small key={i} style={{ color: t.text }}>
                        {n.note}
                      </Small>
                    ))}
                  </View>
                ) : null}
                {g.lastTime ? (
                  <Small>
                    Last time ({g.lastTime.date}): {g.lastTime.sets.map((s) => `${formatWeight(s.weightKg, unit)} × ${s.reps}${s.rpe ? ` @${s.rpe}` : ''}`).join(', ')}
                  </Small>
                ) : null}
                <Row style={{ paddingHorizontal: 4 }}>
                  <Eyebrow style={{ width: 28, textAlign: 'center', fontSize: 10 }}>Set</Eyebrow>
                  <Eyebrow style={{ flex: 1.4, textAlign: 'center', fontSize: 10 }}>{unit}</Eyebrow>
                  <Eyebrow style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>{g.exercise.pattern === 'carry' ? 'Metres' : 'Reps'}</Eyebrow>
                  <Eyebrow style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>RPE</Eyebrow>
                  {live ? <Eyebrow style={{ width: 44, textAlign: 'center', fontSize: 10 }}>Log</Eyebrow> : null}
                </Row>
                {g.sets.map((s, i) => (
                  <SetRow
                    key={`${s.id}:${s.weightKg ?? '-'}`}
                    set={s}
                    label={labels[i]}
                    unit={unit}
                    mode={live ? 'player' : 'review'}
                    highlighted={s.id === nextSetId}
                    onSaveDraft={(v) => saveDraft(s, v)}
                    onToggle={(v) => toggle(g, s, v)}
                    onLongPress={() => (live ? setMenu(s, `${g.exercise.name} · set ${labels[i]}`) : setNoteFor({ kind: 'set', set: s, title: `${g.exercise.name} · set ${labels[i]}` }))}
                  />
                ))}
                {g.sets
                  .map((s, i) => ({ s, label: labels[i] }))
                  .filter(({ s }) => s.note)
                  .map(({ s, label }) => (
                    <Pressable key={`note:${s.id}`} onPress={() => setNoteFor({ kind: 'set', set: s, title: `${g.exercise.name} · set ${label}` })} accessibilityRole="button">
                      <Row gap={6} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                        <Icon name="chatbox-ellipses-outline" size={15} color={t.warning} />
                        <Small style={{ flex: 1, color: t.text }}>
                          Set {label}: {s.note}
                        </Small>
                      </Row>
                    </Pressable>
                  ))}
                <Row gap={18}>
                  {live ? (
                    <Pressable onPress={() => guard('Add set', () => addSet(getDb(), session.id, g.exerciseOrder))} accessibilityRole="button" style={{ paddingVertical: 6 }}>
                      <Row gap={4}>
                        <Icon name="add" size={16} color={t.accent} />
                        <Small style={{ color: t.accent, fontWeight: '700' }}>Add set</Small>
                      </Row>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      // Note goes on the last set you logged for this exercise (or the first set if none yet).
                      const working = g.sets.filter((x) => x.setType !== 'warmup');
                      const target = [...working].reverse().find((x) => x.completed) ?? working[0] ?? g.sets[0];
                      const idx = g.sets.indexOf(target);
                      setNoteFor({ kind: 'set', set: target, title: `${g.exercise.name} · set ${labels[idx]}` });
                    }}
                    accessibilityRole="button"
                    style={{ paddingVertical: 6 }}
                  >
                    <Row gap={4}>
                      <Icon name="create-outline" size={15} color={t.accent} />
                      <Small style={{ color: t.accent, fontWeight: '700' }}>Note</Small>
                    </Row>
                  </Pressable>
                </Row>
              </Card>
            </View>
          );
        })}

        <Card onPress={() => setNoteFor({ kind: 'session' })}>
          <Row gap={8} style={{ flexWrap: 'nowrap' }}>
            <Icon name="chatbox-ellipses-outline" size={20} color={session.notes ? t.warning : t.accent} />
            <View style={{ flex: 1 }}>
              <H2>Workout note</H2>
              <Small style={session.notes ? { color: t.text } : undefined}>{session.notes ?? 'How did it go? Anything to remember next week?'}</Small>
            </View>
            <Icon name="chevron-forward" size={18} color={t.textSecondary} />
          </Row>
        </Card>
        {live ? <Button title="Finish workout" icon="flag" onPress={finish} /> : <Small>Edits to a finished workout are saved as you leave each field.</Small>}
        {live ? <Small>Tip: long-press a set to add a note or remove it. Everything is saved on the phone as you go.</Small> : null}
      </ScrollView>

      {live && restEndsAt ? (
        <RestTimer endsAt={restEndsAt} sound={settings.restCountdownSound} onChange={(v) => (v == null ? endRest() : setRestEndsAt(v))} onDone={onRestDone} nextLabel={nextLabel} />
      ) : null}

      <NoteSheet
        visible={!!noteFor}
        title={noteFor?.kind === 'set' ? 'Note on this set' : 'Workout note'}
        subtitle={noteFor?.kind === 'set' ? noteFor.title : session.name}
        initial={noteFor?.kind === 'set' ? noteFor.set.note : noteFor?.kind === 'session' ? session.notes : null}
        onClose={() => setNoteFor(null)}
        onSave={(note) => {
          const n = noteFor;
          setNoteFor(null);
          if (n) guard('Note', () => (n.kind === 'set' ? setSetNote(getDb(), n.set.id, note) : setSessionNote(getDb(), session.id, note)));
        }}
      />

      <SwapSheet
        visible={!!swapFor}
        exercise={swapFor?.exercise ?? null}
        allowProgram={!!session.enrolmentId && !!swapFor?.programExerciseId}
        onClose={() => setSwapFor(null)}
        onPick={(toId, scope) => {
          const g = swapFor;
          setSwapFor(null);
          if (g)
            guard('Swap', () =>
              swapInSession(getDb(), {
                sessionId: session.id,
                exerciseOrder: g.exerciseOrder,
                toExerciseId: toId,
                scope,
                today: isoDate(),
              }),
            );
        }}
      />
    </View>
  );
}
