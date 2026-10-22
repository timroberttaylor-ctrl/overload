import { router } from 'expo-router';
import { View } from 'react-native';

import { MiniBars } from '@/components/mini-bars';
import { VolumeCard } from '@/components/volume-card';
import { Body, Card, Display, Eyebrow, H1, ListRow, Screen, SectionHeader, Small, Stat, StatStrip, Tag } from '@/components/ui';
import { addDays, isoDate } from '@/core/dates';
import { formatWeight } from '@/core/units';
import { listBodyweights } from '@/db/repositories/body';
import { getActiveEnrolment } from '@/db/repositories/enrolments';
import { currentProgramWeek, weekVolume } from '@/db/repositories/planner';
import { listLoggedExercises, listSessions } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

export default function ProgressScreen() {
  const t = useTheme();
  const [data] = useDbQuery((db) => ({
    sessions: listSessions(db, 30),
    lifts: listLoggedExercises(db).slice(0, 12),
    weights: listBodyweights(db).slice(-30),
    unit: getSettings(db).units,
    since: addDays(isoDate(), -30),
    volume: (() => {
      const e = getActiveEnrolment(db);
      return e ? weekVolume(db, e.id, currentProgramWeek(db, e)) : null;
    })(),
  }));
  if (!data) return null;
  const { sessions, lifts, weights, unit, since, volume } = data;
  const last30 = sessions.filter((s) => s.date >= since);
  const change = weights.length > 1 ? weights[weights.length - 1].kg - weights[0].kg : 0;

  return (
    <Screen>
      <View>
        <Eyebrow color={t.accent}>Progress</Eyebrow>
        <H1>Your training</H1>
      </View>

      <Card raised>
        <StatStrip>
          <Stat value={String(last30.length)} label="Workouts 30d" />
          <Stat value={String(last30.reduce((n, s) => n + s.setsDone, 0))} label="Sets 30d" />
          <Stat value={formatWeight(last30.reduce((n, s) => n + s.volumeKg, 0) / 1000, unit).replace(` ${unit}`, 'k')} label={`Volume ${unit}`} />
        </StatStrip>
      </Card>

      {volume ? <VolumeCard title={`Sets per muscle · week ${volume.week}`} done={volume.done} planned={volume.planned} /> : null}

      {weights.length > 1 ? (
        <>
          <SectionHeader title="Body weight" />
          <Card>
            <Display style={{ fontSize: 28 }}>{formatWeight(weights[weights.length - 1].kg, unit)}</Display>
            <Small>
              {change >= 0 ? '+' : '−'}
              {formatWeight(Math.abs(change), unit)} since {weights[0].date}
            </Small>
            <MiniBars values={weights.map((w) => w.kg)} labels={weights.map((w) => w.date.slice(5))} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Lifts" />
      <Card>
        {lifts.length ? (
          lifts.map(({ exercise, state }) => (
            <ListRow
              key={exercise.id}
              icon="barbell-outline"
              title={exercise.name}
              subtitle={`e1RM ${state.e1rmKg ? formatWeight(state.e1rmKg, unit) : '–'} · working ${formatWeight(state.workingWeightKg, unit)}`}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
            />
          ))
        ) : (
          <Body muted>Finish a workout to see your lifts here.</Body>
        )}
      </Card>

      <SectionHeader title="Workout log" />
      <Card>
        {sessions.length ? (
          sessions.map((s) => (
            <ListRow
              key={s.id}
              icon="calendar-outline"
              title={s.name}
              subtitle={`${s.date} · ${s.setsDone} sets · ${formatWeight(s.volumeKg, unit)}${s.endedAt ? ` · ${Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000))} min` : ''}`}
              right={s.status === 'partial' ? <Tag label="Partial" tone="warning" /> : undefined}
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
            />
          ))
        ) : (
          <Body muted>No workouts logged yet.</Body>
        )}
      </Card>
    </Screen>
  );
}
