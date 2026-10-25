import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Keyboard, Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';
import { RestTimer } from '@/components/rest-timer';
import { SetRow, type SetValues } from '@/components/set-row';
import { HistorySheet } from '@/components/history-sheet';
import { saveWorkoutToHealth } from '@/integrations/apple-health';
import { NoteSheet } from '@/components/note-sheet';
import { PrToast, type PrToastData } from '@/components/pr-toast';
import { SwapSheet } from '@/components/swap-sheet';
import { TempoChip } from '@/components/tempo-chip';
import { Body, Button, Card, Eyebrow, H2, Icon, ProgressBar, Row, Small } from '@/components/ui';
import { isoDate } from '@/core/dates';
import { describeLoading, loadBar } from '@/core/plates';
import { describePR } from '@/core/records';
import { nextSet, restKindAfter, withLogged } from '@/core/session-flow';
import { formatWeight, kgToDisplay } from '@/core/units';
import { getDb } from '@/db/client';
import { getSettings } from '@/db/repositories/settings';
import {
  addSet,
  discardSession,
  easeRemainingSets,
  exerciseHistory,
  headlinePR,
  prForSet,
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
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { groupName, seriesCode, seriesLabels } from '@/constants/colour-codes';

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

/** "1–2 reps" for RPE 8.5, "2 reps" for RPE 8 */
function rirText(rpe: number): string {
  const r = 10 - rpe;
  if (Number.isInteger(r)) return `${r} rep${r === 1 ? '' : 's'}`;
  return `${Math.floor(r)}–${Math.ceil(r)} reps`;
}

function setLabels(sets: SetLog[]): string[] {
  let n = 0;
  return sets.map((s) => (s.setType === 'warmup' ? 'W' : String(++n)));
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const scheme = useSchemeName();
  const [data, refresh] = useDbQuery((db) => ({
    detail: getSessionDetail(db, id),
    settings: getSettings(db),
  }));
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  /** Each new rest gets a fresh timer (its own start time, title and lock-screen activity) */
  const [rest, setRest] = useState<{ key: number; title: string }>({ key: 0, title: 'Rest' });
  const [toast, setToast] = useState<PrToastData | null>(null);
  /** Sets that beat a record when logged in this visit (shown with a trophy) */
  const [prSets, setPrSets] = useState<Set<string>>(() => new Set());
  const [historyFor, setHistoryFor] = useState<ExerciseGroup | null>(null);
  const hideToast = useCallback(() => setToast(null), []);
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
  // Superset-aware: A1 → A2 → A1 → A2…, not every set of A1 first.
  const upNext = nextSet(groups);
  const nextSetId = upNext?.setId;
  const nextGroup = upNext ? groups[upNext.groupIndex] : undefined;
  const rpeTargets = [...new Set(allSets.filter((s) => s.setType !== 'warmup' && s.targetRpe != null && s.targetRpe < 10).map((s) => s.targetRpe!))];
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
      if (set.completed) {
        setPrSets((p) => {
          const n = new Set(p);
          n.delete(set.id);
          return n;
        });
        return unlogSet(getDb(), set.id);
      }
      if (v.weightKg == null || v.reps == null) throw new Error('Enter a weight (0 for bodyweight) and reps first');
      logSet(getDb(), set.id, {
        weightKg: v.weightKg,
        reps: v.reps,
        rpe: v.rpe,
      });
      const fmt = (kg: number) => formatWeight(kg, unit);
      // Effort ran well over target: lighten the rest of this exercise so the sets stay at target RPE.
      const eased = easeRemainingSets(getDb(), set.id);
      const easedText = eased
        ? `RPE ${eased.rpe} vs target ${eased.targetRpe}, so the next ${eased.count === 1 ? 'set drops' : `${eased.count} sets drop`} to ${fmt(eased.toKg)}. Feeling fresh? Change it back.`
        : null;
      const pr = headlinePR(prForSet(getDb(), set.id));
      if (pr) {
        setPrSets((p) => new Set(p).add(set.id));
        setToast({ key: Date.now(), title: `New PR: ${fmt(v.weightKg)} × ${v.reps}`, detail: easedText ?? describePR(pr, fmt) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        if (eased && easedText) setToast({ key: Date.now(), title: `Lighter for the rest: ${fmt(eased.toKg)}`, detail: easedText });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      // Superset round: a short changeover to the next exercise, the full rest after the last one.
      const idx = groups.indexOf(group);
      const after = withLogged(groups, set.id);
      const changeover = restKindAfter(after, idx) === 'changeover';
      const restS = changeover ? settings.supersetChangeoverS : (set.restS ?? group.restS);
      setRest((r) => ({ key: r.key + 1, title: changeover ? 'Next' : 'Rest' }));
      setRestEndsAt(restS > 0 ? Date.now() + restS * 1000 : null);
      // Auto-advance: bring the next exercise into view once this one is finished.
      const next = nextSet(after);
      const nextGroup = next ? groups[next.groupIndex] : undefined;
      pendingScroll.current = null;
      if (nextGroup && nextGroup !== group) {
        const key = cardKey(nextGroup);
        if (settings.autoAdvanceAfterLog || changeover || restS === 0) {
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
        // Apple Health (opt-in, installed iOS builds). Logged-later workouts have made-up times, so they're skipped.
        if (settings.appleHealth && !session.isBackfill) saveWorkoutToHealth({ start: new Date(session.startedAt), end: new Date() }).catch(() => {});
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
          {live && rpeTargets.length ? (
            <Small>
              {`RPE ${rpeTargets.length === 1 ? rpeTargets[0] : 'targets'} ${rpeTargets.length === 1 ? `means about ${rirText(rpeTargets[0])} left in the tank. ` : 'show how hard each set should feel. '}`}
              Keep the weight while a set lands within 1 of target; if one goes higher, OVRLD lightens the rest of that exercise.
            </Small>
          ) : null}
        </View>

        {groups.map((g, gi, all) => {
          const labels = setLabels(g.sets);
          const sc = g.series ? seriesCode(g.series, scheme) : null;
          const seriesLabel = seriesLabels(all.map((x) => x.series))[gi];
          const groupSize = g.series ? all.filter((x) => x.series === g.series).length : 1;
          const firstOfGroup = groupSize > 1 && all.findIndex((x) => x.series === g.series) === gi;
          return (
            <View key={cardKey(g)} onLayout={(e: LayoutChangeEvent) => cardY.current.set(cardKey(g), e.nativeEvent.layout.y)} style={{ gap: 6 }}>
              {firstOfGroup && sc ? (
                <Row gap={6} style={{ paddingLeft: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sc.solid }} />
                  <Small style={{ color: sc.text, fontWeight: '600' }}>{`${groupName(groupSize)} ${g.series} · ${groupSize} exercises back to back`}</Small>
                </Row>
              ) : null}
              <Card style={sc ? { borderLeftWidth: 4, borderLeftColor: sc.solid } : undefined}>
                <Row
                  style={{
                    justifyContent: 'space-between',
                    flexWrap: 'nowrap',
                  }}
                >
                  <Row gap={10} style={{ flex: 1, flexWrap: 'nowrap' }}>
                    <ExerciseDemo
                      exerciseId={g.exercise.id}
                      equipment={g.exercise.equipment}
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
                              backgroundColor: sc?.tint ?? t.accentDim,
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: sc?.text ?? t.accent,
                                fontWeight: '700',
                                fontSize: 12,
                              }}
                            >
                              {seriesLabel}
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
                  <Pressable onPress={() => setHistoryFor(g)} accessibilityRole="button" accessibilityLabel="Exercise history" hitSlop={6} style={{ padding: 4 }}>
                    <Icon name="time-outline" size={22} color={t.textSecondary} />
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
                {live && g.exercise.equipment === 'barbell'
                  ? (() => {
                      const next = g.sets.find((x) => !x.completed && x.setType !== 'warmup' && x.weightKg != null) ?? [...g.sets].reverse().find((x) => x.weightKg != null);
                      const l = next?.weightKg != null ? loadBar(kgToDisplay(next.weightKg, unit), unit, unit === 'kg' ? settings.plateIncrementKg : 5) : null;
                      return l ? (
                        <Row gap={6} style={{ flexWrap: 'nowrap' }}>
                          <Icon name="barbell-outline" size={15} color={t.accent} />
                          <Small style={{ flex: 1 }}>{describeLoading(l, unit)}</Small>
                        </Row>
                      ) : null;
                    })()
                  : null}
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
                    pr={prSets.has(s.id)}
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
        <RestTimer key={rest.key} title={rest.title} endsAt={restEndsAt} sound={settings.restCountdownSound} onChange={(v) => (v == null ? endRest() : setRestEndsAt(v))} onDone={onRestDone} nextLabel={nextLabel} />
      ) : null}

      <PrToast toast={toast} onHide={hideToast} />

      <HistorySheet
        visible={!!historyFor}
        title={historyFor?.exercise.name ?? ''}
        unit={unit}
        history={historyFor ? exerciseHistory(getDb(), historyFor.exercise.id, { programExerciseId: historyFor.programExerciseId, excludeSessionId: session.id }) : null}
        onClose={() => setHistoryFor(null)}
      />

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
