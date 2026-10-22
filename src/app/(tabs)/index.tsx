import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { DayPlanList } from '@/components/day-plan';
import { RecoveryCard } from '@/components/recovery-card';
import { Body, Button, Card, Display, Eyebrow, Field, H1, H2, Icon, Row, Screen, SectionHeader, Small, Stat, StatStrip, Tag } from '@/components/ui';
import { WeekStrip } from '@/components/week-strip';
import { addDays, isoDate } from '@/core/dates';
import { displayToKg, formatWeight } from '@/core/units';
import { getDb } from '@/db/client';
import { currentNutritionTarget, latestBodyweight, logBodyweight, setNutritionTarget, type Goal } from '@/db/repositories/body';
import { getActiveEnrolment, programDayPlan } from '@/db/repositories/enrolments';
import { listHealthDays } from '@/db/repositories/health';
import { reviewState } from '@/db/repositories/planner';
import { PLAN_LABEL, changeSummary } from '@/core/planner';
import { getTemplateDetail } from '@/db/repositories/programs';
import { completeRestDay, discardSession, getInProgressSession, programWeek, sessionForProgramDay, startProgramSession } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

const PHASE_LABEL: Record<string, string> = {
  accumulation: 'Build',
  intensification: 'Intensify',
  realisation: 'Peak',
  deload: 'Deload',
};

export default function TrainScreen() {
  const t = useTheme();
  const today = isoDate();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showExercises, setShowExercises] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);

  const [data, refresh] = useDbQuery((db) => {
    const enrolment = getActiveEnrolment(db);
    const template = enrolment ? getTemplateDetail(db, enrolment.templateId)?.template : undefined;
    const day = enrolment ? (selectedDay ?? enrolment.currentDayIndex) : 0;
    const plan = enrolment ? programDayPlan(db, enrolment, day) : undefined;
    return {
      settings: getSettings(db),
      enrolment,
      template,
      plan,
      week: enrolment && plan ? programWeek(db, enrolment.id, plan.week) : undefined,
      dayLog: enrolment && plan ? sessionForProgramDay(db, enrolment.id, plan.programDay) : undefined,
      inProgress: getInProgressSession(db),
      review: reviewState(db, enrolment),
      health: listHealthDays(db, addDays(today, -30), today),
      weight: latestBodyweight(db),
      target: currentNutritionTarget(db, today),
    };
  });
  const [weightText, setWeightText] = useState('');

  if (!data) return null;
  const { settings, enrolment, template, plan, week, dayLog, inProgress, weight, target, health, review } = data;
  const unit = settings.units;
  const fail = (title: string, e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));

  const selectDay = (pd: number) => {
    setSelectedDay(pd);
    setShowExercises(false);
  };
  const changeWeek = (delta: number) => {
    if (!week || !template) return;
    const w = Math.max(1, Math.min(week.totalWeeks, week.week + delta));
    selectDay((w - 1) * template.cycleLength);
  };

  const start = (pastDate?: string) => {
    if (!enrolment || !plan) return;
    try {
      const s = startProgramSession(getDb(), {
        enrolmentId: enrolment.id,
        programDay: plan.programDay,
        date: pastDate ?? today,
        backfill: !!pastDate,
        today,
      });
      setSelectedDay(null);
      setBackfillOpen(false);
      router.push({ pathname: '/session/[id]', params: { id: s.id } });
    } catch (e) {
      fail('Start workout', e);
    }
  };

  const restDone = () => {
    if (!enrolment || !plan) return;
    completeRestDay(getDb(), enrolment.id, plan.programDay);
    setSelectedDay(null);
    refresh();
  };

  const discardInProgress = () => {
    if (!inProgress) return;
    Alert.alert('Discard workout?', 'Nothing from it will be saved.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discardSession(getDb(), inProgress.id);
          refresh();
        },
      },
    ]);
  };

  const saveWeight = () => {
    try {
      logBodyweight(getDb(), today, displayToKg(Number(weightText.replace(',', '.')), unit));
      setWeightText('');
      refresh();
    } catch (e) {
      fail('Body weight', e);
    }
  };

  const chooseTarget = (goal: Goal) => {
    try {
      setNutritionTarget(getDb(), today, goal, 'moderate');
      refresh();
    } catch (e) {
      fail('Nutrition', e);
    }
  };

  const workingSets = plan?.slots.reduce((n, s) => n + s.workingSets, 0) ?? 0;
  const isCurrent = plan && enrolment ? plan.programDay === enrolment.currentDayIndex : false;
  const dayStatus = week?.days.find((d) => d.programDay === plan?.programDay)?.status;

  return (
    <Screen>
      {/* Header */}
      {enrolment && template ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/program/[id]',
              params: { id: template.id },
            })
          }
          accessibilityRole="button"
        >
          <Eyebrow color={t.accent}>Active program</Eyebrow>
          <Row gap={6}>
            <H1>{template.name}</H1>
            <Icon name="chevron-forward" size={20} color={t.textSecondary} />
          </Row>
        </Pressable>
      ) : (
        <View>
          <Eyebrow color={t.accent}>Overload</Eyebrow>
          <H1>Train</H1>
        </View>
      )}

      {/* In progress */}
      {inProgress ? (
        <Card style={{ borderColor: t.accent, borderWidth: 1 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Eyebrow color={t.accent}>Workout in progress</Eyebrow>
              <H2>{inProgress.name}</H2>
              <Small>
                Started{' '}
                {new Date(inProgress.startedAt).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Small>
            </View>
            <Icon name="pulse" size={28} color={t.accent} />
          </Row>
          <Row>
            <Button
              title="Resume"
              icon="play"
              onPress={() =>
                router.push({
                  pathname: '/session/[id]',
                  params: { id: inProgress.id },
                })
              }
              style={{ flex: 1 }}
            />
            <Button title="Discard" variant="ghost" onPress={discardInProgress} />
          </Row>
        </Card>
      ) : null}

      {enrolment && plan && template && week ? (
        <>
          {/* Week selector + strip */}
          <View style={{ gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pressable onPress={() => changeWeek(-1)} disabled={week.week <= 1} hitSlop={12} accessibilityRole="button" accessibilityLabel="Previous week">
                <Icon name="chevron-back" size={22} color={week.week <= 1 ? t.border : t.text} />
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <H2>Week {week.week}</H2>
                <Small>
                  of {week.totalWeeks}
                  {plan.phase.kind !== 'accumulation' ? ` · ${PHASE_LABEL[plan.phase.kind]}` : ''}
                </Small>
              </View>
              <Pressable onPress={() => changeWeek(1)} disabled={week.week >= week.totalWeeks} hitSlop={12} accessibilityRole="button" accessibilityLabel="Next week">
                <Icon name="chevron-forward" size={22} color={week.week >= week.totalWeeks ? t.border : t.text} />
              </Pressable>
            </Row>
            <WeekStrip days={week.days} selected={plan.programDay} onSelect={selectDay} />
          </View>

          {/* Weekly planner */}
          {review.status === 'due' && week.week === review.planWeek ? (
            <Card style={{ borderColor: t.accent, borderWidth: 1 }} onPress={() => router.push('/week-review')}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Eyebrow color={t.accent}>Week {review.reviewWeek} done</Eyebrow>
                  <H2>Plan week {review.planWeek}</H2>
                  <Small>A one-minute check-in, then a recommendation for this week based on how last week went.</Small>
                </View>
                <Icon name="calendar" size={28} color={t.accent} />
              </Row>
              <Button title="Review week" icon="arrow-forward" onPress={() => router.push('/week-review')} />
            </Card>
          ) : null}
          {review.status === 'planned' && week.week === review.planWeek && review.plan.row.accepted && review.plan.decision.kind !== 'as_written' ? (
            <Card onPress={() => router.push('/week-review')}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Eyebrow color={t.accent}>This week</Eyebrow>
                  <H2>{PLAN_LABEL[review.plan.decision.kind]}</H2>
                  <Small>{changeSummary(review.plan.decision).join(' · ')}</Small>
                </View>
                <Icon name="chevron-forward" size={20} color={t.textSecondary} />
              </Row>
            </Card>
          ) : null}

          {/* Day hero */}
          <Card raised style={{ padding: 20, gap: 12 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Eyebrow>
                Day {plan.programDay + 1}
                {isCurrent ? ' · Up next' : ''}
              </Eyebrow>
              {dayStatus === 'done' ? (
                <Tag label="Completed" tone="accent" />
              ) : dayStatus === 'partial' ? (
                <Tag label="Partial" tone="warning" />
              ) : dayStatus === 'missed' ? (
                <Tag label="Skipped" />
              ) : null}
            </Row>
            {plan.day.isRest ? (
              <>
                <Row gap={10}>
                  <Icon name="moon" size={28} color={t.accent} />
                  <Display>Rest day</Display>
                </Row>
                <Body muted>Recover today. A walk or light mobility is fine; sleep is where the progress happens.</Body>
                {isCurrent && !inProgress ? <Button title="Complete rest day" icon="checkmark" onPress={restDone} /> : null}
              </>
            ) : (
              <>
                <Display>{plan.day.name}</Display>
                <Row gap={6}>
                  {plan.day.focus.split(' · ').map((f) => (
                    <Tag key={f} label={f} />
                  ))}
                </Row>
                <StatStrip>
                  <Stat value={String(plan.slots.length)} label="Exercises" />
                  <Stat value={String(workingSets)} label="Sets" />
                  <Stat value={`~${template.minutes}`} label="Minutes" />
                </StatStrip>
                {showExercises ? (
                  <DayPlanList
                    slots={plan.slots}
                    onOpenExercise={(id) =>
                      router.push({
                        pathname: '/exercise/[id]',
                        params: { id },
                      })
                    }
                  />
                ) : null}
                <Row>
                  <Button title={showExercises ? 'Hide' : 'View workout'} variant="secondary" onPress={() => setShowExercises((v) => !v)} style={{ flex: 1 }} />
                  {dayLog && !inProgress ? (
                    <Button
                      title="View log"
                      variant="secondary"
                      icon="document-text-outline"
                      onPress={() =>
                        router.push({
                          pathname: '/session/[id]',
                          params: { id: dayLog.id },
                        })
                      }
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  {!inProgress ? <Button title={dayLog ? 'Redo' : `Start day ${plan.programDay + 1}`} icon="play" onPress={() => start()} style={{ flex: 1 }} /> : null}
                </Row>
                {!inProgress && !dayLog ? (
                  backfillOpen ? (
                    <View style={{ gap: 8 }}>
                      <Small>Did this workout already but forgot to log it? Pick the day you did it:</Small>
                      <Row gap={8}>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                          const d = addDays(today, -n);
                          const label = n === 1 ? 'Yesterday' : new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric' });
                          return <Button key={d} compact variant="secondary" title={label} onPress={() => start(d)} />;
                        })}
                        <Button compact variant="ghost" title="Cancel" onPress={() => setBackfillOpen(false)} />
                      </Row>
                    </View>
                  ) : (
                    <Button compact variant="ghost" icon="time-outline" title="Log a past workout" onPress={() => setBackfillOpen(true)} />
                  )
                ) : null}
              </>
            )}
          </Card>
        </>
      ) : (
        <Card raised style={{ padding: 20 }}>
          <Icon name="layers" size={28} color={t.accent} />
          <Display>Pick a program</Display>
          <Body muted>Choose a plan and every session comes with targets that move up as you get stronger.</Body>
          <Button title="Browse programs" onPress={() => router.push('/programs')} />
        </Card>
      )}

      <RecoveryCard days={health} today={today} />

      {/* Shortcuts */}
      <Row gap={12} style={{ flexWrap: 'nowrap' }}>
        <Card style={{ flex: 1 }} onPress={() => router.push('/library')}>
          <Icon name="library" size={22} color={t.accent} />
          <H2>Exercise library</H2>
          <Small>Cues and alternatives</Small>
        </Card>
        <Card style={{ flex: 1 }} onPress={() => router.push('/progress')}>
          <Icon name="trending-up" size={22} color={t.accent} />
          <H2>Progress</H2>
          <Small>PRs and history</Small>
        </Card>
      </Row>

      {/* Body weight */}
      <SectionHeader title="Body weight" />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Display style={{ fontSize: 28 }}>{weight ? formatWeight(weight.kg, unit) : '–'}</Display>
            <Small>{weight ? `Last weigh-in ${weight.date}` : 'No weigh-ins yet'}</Small>
          </View>
          <Icon name="scale-outline" size={26} color={t.textSecondary} />
        </Row>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Field value={weightText} onChangeText={setWeightText} placeholder={`Today (${unit})`} keyboardType="decimal-pad" style={{ flex: 1 }} onSubmitEditing={saveWeight} />
          <Button title="Log" compact onPress={saveWeight} disabled={!weightText} />
        </Row>
      </Card>

      {/* Nutrition */}
      <SectionHeader title="Nutrition target" />
      <Card>
        {target ? (
          <StatStrip>
            <Stat value={String(target.kcal)} label="kcal" />
            <Stat value={`${target.proteinG}g`} label="Protein" />
            <Stat value={`${target.carbsG}g`} label="Carbs" />
            <Stat value={`${target.fatG}g`} label="Fat" />
          </StatStrip>
        ) : (
          <Body muted>Pick a goal to get daily calories and macros from your latest weight.</Body>
        )}
        <Row>
          {(['cut', 'maintain', 'gain'] as Goal[]).map((g) => (
            <Button key={g} compact title={g === 'gain' ? 'Lean gain' : g[0].toUpperCase() + g.slice(1)} variant={target?.goal === g ? 'primary' : 'secondary'} onPress={() => chooseTarget(g)} />
          ))}
        </Row>
        {target ? <Small>Based on {formatWeight(target.basedOnKg, unit)} and moderate activity.</Small> : null}
      </Card>
    </Screen>
  );
}
