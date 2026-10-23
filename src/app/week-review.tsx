import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Body, Button, Card, Eyebrow, H1, H2, Icon, Row, Screen, Small, Tag } from '@/components/ui';
import { isoDate } from '@/core/dates';
import { JOINT_REGIONS, PLAN_LABEL, REGION_LABEL, adherence, changeSummary, hitRate, type CheckIn, type JointRegion } from '@/core/planner';
import { getDb } from '@/db/client';
import { getActiveEnrolment } from '@/db/repositories/enrolments';
import { clearWeekPlan, getCheckIn, getWeekPlan, recommendWeek, reviewState, saveCheckIn, saveWeekPlan, weekNotes } from '@/db/repositories/planner';
import { VolumeCard } from '@/components/volume-card';
import { useDbQuery } from '@/hooks/use-db-query';
import { planCode } from '@/constants/colour-codes';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

const SCALES: { key: keyof Omit<CheckIn, 'jointPainRegion'>; title: string; low: string; high: string }[] = [
  { key: 'fatigue', title: 'Overall fatigue', low: 'Fresh', high: 'Exhausted' },
  { key: 'soreness', title: 'Muscle soreness', low: 'None', high: 'Very sore' },
  { key: 'motivation', title: 'Motivation to train', low: 'None', high: 'Fired up' },
  { key: 'jointPain', title: 'Joint pain', low: 'None', high: 'Severe' },
];

const DEFAULT_CHECKIN: CheckIn = { fatigue: 2, soreness: 2, motivation: 3, jointPain: 1, jointPainRegion: null };

function Scale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useTheme();
  return (
    <Row gap={8} style={{ flexWrap: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n === value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={String(n)}
            style={{ flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : t.backgroundSelected }}
          >
            <Text style={{ color: on ? t.accentText : t.text, fontWeight: '600', fontSize: 16 }}>{n}</Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

function Bullets({ items, icon }: { items: string[]; icon: 'checkmark-circle' | 'information-circle-outline' }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {items.map((r) => (
        <Row key={r} gap={8} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <Icon name={icon} size={16} color={icon === 'checkmark-circle' ? t.accent : t.textSecondary} />
          <Body style={{ flex: 1, fontSize: 14 }}>{r}</Body>
        </Row>
      ))}
    </View>
  );
}

export default function WeekReviewScreen() {
  const t = useTheme();
  const scheme = useSchemeName();
  const today = isoDate();
  const [data, refresh] = useDbQuery((db) => {
    const enrolment = getActiveEnrolment(db);
    const state = reviewState(db, enrolment);
    const planWeek = state.status === 'none' ? null : state.planWeek;
    return {
      enrolment,
      planWeek,
      stored: enrolment && planWeek ? getWeekPlan(db, enrolment.id, planWeek) : null,
      savedCheckIn: enrolment && planWeek ? getCheckIn(db, enrolment.id, planWeek - 1) : null,
    };
  });
  const [draft, setDraft] = useState<CheckIn | null>(null);
  const [skip, setSkip] = useState(false);

  const { enrolment, planWeek, stored, savedCheckIn } = data;
  if (!enrolment || !planWeek) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Week review' }} />
        <Body muted>Week reviews start once you finish your first program week.</Body>
      </Screen>
    );
  }

  // ---- A plan was already chosen for this week: show it, with the option to review again
  if (stored) {
    const d = stored.decision;
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: `Week ${planWeek}` }} />
        <View>
          <Eyebrow color={t.accent}>This week&apos;s plan</Eyebrow>
          <H1>{stored.row.accepted ? PLAN_LABEL[d.kind] : 'As written'}</H1>
          {!stored.row.accepted ? <Small>You chose to keep the program as written instead of: {PLAN_LABEL[d.kind].toLowerCase()}.</Small> : null}
        </View>
        {stored.row.accepted ? (
          <Card>
            <H2>What changes</H2>
            <Bullets items={changeSummary(d)} icon="checkmark-circle" />
          </Card>
        ) : null}
        <Card>
          <H2>Why</H2>
          <Bullets items={d.reasons} icon="information-circle-outline" />
        </Card>
        <Button
          title="Review again"
          variant="secondary"
          icon="refresh"
          onPress={() => {
            clearWeekPlan(getDb(), enrolment.id, planWeek);
            setDraft(null);
            refresh();
          }}
        />
        <Small>Workouts already done this week keep what they were given; the rest of the week follows the new choice.</Small>
      </Screen>
    );
  }

  // ---- Review: check-in + live recommendation
  const checkIn = skip ? null : (draft ?? savedCheckIn ?? DEFAULT_CHECKIN);
  const rec = recommendWeek(getDb(), enrolment.id, planWeek, checkIn);
  const notes = weekNotes(getDb(), enrolment.id, rec.reviewWeek);
  const m = rec.metrics;
  const hr = hitRate(m);
  const adh = adherence(m);
  const set = (k: keyof CheckIn, v: number | JointRegion | null) => setDraft({ ...(checkIn ?? DEFAULT_CHECKIN), [k]: v } as CheckIn);
  const needsRegion = !!checkIn && checkIn.jointPain >= 3 && !checkIn.jointPainRegion;
  const changes = rec.decision.kind !== 'as_written' && rec.decision.kind !== 'planned_deload';
  const hasRegion = !!rec.decision.region;

  const save = (accepted: boolean) => {
    try {
      const db = getDb();
      if (checkIn) saveCheckIn(db, { enrolmentId: enrolment.id, week: rec.reviewWeek, checkIn, date: today });
      saveWeekPlan(db, { enrolmentId: enrolment.id, recommendation: rec, accepted, date: today });
      router.back();
    } catch (e) {
      Alert.alert('Week review', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: `Week ${rec.reviewWeek} review` }} />
      <View>
        <Eyebrow color={t.accent}>Plan week {planWeek}</Eyebrow>
        <H1>How did week {rec.reviewWeek} go?</H1>
      </View>

      {/* Numbers */}
      <Card>
        <H2>What you did</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Sessions</Small>
          <Body>
            {m.completedSessions} of {m.plannedSessions}
            {adh != null && adh >= 1 ? ' ✓' : ''}
          </Body>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Sets that hit target reps</Small>
          <Body>{hr != null ? `${Math.round(hr * 100)}% (${m.setsHitTarget}/${m.setsWithTarget})` : m.setsWithTarget ? `${m.setsHitTarget}/${m.setsWithTarget}` : '–'}</Body>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Small>Effort vs plan</Small>
          <Body>{m.rpeGap == null ? 'No RPE logged' : m.rpeGap > 0.25 ? `Harder (RPE +${m.rpeGap.toFixed(1)})` : m.rpeGap < -0.25 ? `Easier (RPE ${m.rpeGap.toFixed(1)})` : 'On target'}</Body>
        </Row>
        {m.mainLifts.length ? (
          <View style={{ gap: 4 }}>
            <Small>Main lifts vs the 2 weeks before (estimated 1RM)</Small>
            {m.mainLifts.map((l) => (
              <Row key={l.exerciseId} style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontSize: 14 }}>{l.name}</Body>
                <Body style={{ fontSize: 14, color: l.changePct > 0 ? t.accent : l.changePct <= -2.5 ? t.warning : t.textSecondary }}>
                  {l.changePct > 0 ? '+' : ''}
                  {l.changePct}%
                </Body>
              </Row>
            ))}
          </View>
        ) : null}
      </Card>

      {m.volume ? <VolumeCard title={`Sets per muscle in week ${rec.reviewWeek}`} done={m.volume} /> : null}

      {/* Notes */}
      {notes.length ? (
        <Card>
          <Row gap={8}>
            <Icon name="chatbox-ellipses-outline" size={18} color={t.warning} />
            <H2>Your notes from week {rec.reviewWeek}</H2>
          </Row>
          {notes.map((n, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Small>
                {n.date} · {n.session}
                {n.exercise ? ` · ${n.exercise}` : ''}
              </Small>
              <Body style={{ fontSize: 14 }}>{n.note}</Body>
            </View>
          ))}
          <Small>Worth factoring into the check-in below, e.g. joint pain.</Small>
        </Card>
      ) : null}

      {/* Check-in */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <H2>Check-in</H2>
          <Button compact variant="ghost" title={skip ? 'Add check-in' : 'Skip'} onPress={() => setSkip((v) => !v)} />
        </Row>
        {skip || !checkIn ? (
          <Small>Skipped. The plan uses your logged sets only, and a push week needs a check-in.</Small>
        ) : (
          <View style={{ gap: 16 }}>
            {SCALES.map((sc) => (
              <View key={sc.key} style={{ gap: 6 }}>
                <Body style={{ fontWeight: '700' }}>{sc.title}</Body>
                <Scale value={checkIn[sc.key]} onChange={(v) => set(sc.key, v)} />
                <Row style={{ justifyContent: 'space-between' }}>
                  <Small>1 · {sc.low}</Small>
                  <Small>5 · {sc.high}</Small>
                </Row>
              </View>
            ))}
            {checkIn.jointPain >= 3 ? (
              <View style={{ gap: 6 }}>
                <Body style={{ fontWeight: '700' }}>Where?</Body>
                <Row gap={8}>
                  {JOINT_REGIONS.map((r) => (
                    <Button key={r} compact title={REGION_LABEL[r]} variant={checkIn.jointPainRegion === r ? 'primary' : 'secondary'} onPress={() => set('jointPainRegion', r)} />
                  ))}
                </Row>
              </View>
            ) : null}
          </View>
        )}
      </Card>

      {/* Recommendation */}
      <Card raised style={{ borderColor: t.accent, borderWidth: changes ? 1 : 0 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Eyebrow color={t.accent}>Recommended for week {planWeek}</Eyebrow>
          <Tag label={PLAN_LABEL[rec.decision.kind]} code={planCode(rec.decision.kind, scheme)} />
        </Row>
        <Bullets items={changeSummary(rec.decision)} icon="checkmark-circle" />
        <View style={{ height: 1, backgroundColor: t.border }} />
        <Bullets items={rec.decision.reasons} icon="information-circle-outline" />
      </Card>

      {needsRegion ? <Small style={{ color: t.warning }}>Pick where the joint pain is to continue.</Small> : null}
      {changes || hasRegion ? (
        <>
          <Button title="Accept plan" icon="checkmark" disabled={needsRegion} onPress={() => save(true)} />
          <Button title="Keep program as written" variant="secondary" disabled={needsRegion} onPress={() => save(false)} />
        </>
      ) : (
        <Button title="Continue" icon="arrow-forward" disabled={needsRegion} onPress={() => save(true)} />
      )}
      <Small>You can review again from the Train tab at any time this week.</Small>
    </Screen>
  );
}
