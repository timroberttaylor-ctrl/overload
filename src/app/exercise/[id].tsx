import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';

import { ExerciseDemo } from '@/components/exercise-demo';

import { MiniBars } from '@/components/mini-bars';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { Body, Button, Card, Display, Field, H2, Icon, ListRow, Row, Screen, Small, Stat, StatStrip, Tag } from '@/components/ui';
import { getDb } from '@/db/client';
import { MEDIA_CREDIT } from '@/db/seed/exercise-media';
import { useTheme } from '@/hooks/use-theme';
import { isSafeWebUrl } from '@/core/safe-url';
import { formatWeight } from '@/core/units';
import { getExercise, setExerciseMediaUrl, suggestAlternatives } from '@/db/repositories/exercises';
import { exerciseProgress } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';
import { parseMuscles } from '@/core/json';

/** Only ever hand plain web links to the OS - never intent://, file:// or other app schemes. */
function openMediaLink(url: string | null) {
  if (!isSafeWebUrl(url)) {
    Alert.alert('Link blocked', 'Only web links starting with https:// can be opened. Change the link to fix this.');
    return;
  }
  Linking.openURL(url).catch(() => Alert.alert('Could not open that link'));
}

export default function ExerciseScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [data, refresh] = useDbQuery((db) => ({
    ex: getExercise(db, id),
    alts: suggestAlternatives(db, id, 5),
    progress: exerciseProgress(db, id),
    unit: getSettings(db).units,
  }));
  if (!data?.ex) return null;
  const { ex, alts, progress, unit } = data;
  const fmt = (kg: number) => formatWeight(kg, unit);
  const chron = [...progress.sessions].reverse().slice(-20);
  const secondary = parseMuscles(ex.secondaryMuscles);
  const saveLink = () => {
    try {
      setExerciseMediaUrl(getDb(), ex.id, editingLink);
      setEditingLink(null);
      refresh();
    } catch (e) {
      Alert.alert('Video link', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen edges={[]}>
      <ExerciseDemo exerciseId={ex.id} equipment={ex.equipment} />
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Display style={{ flex: 1 }}>{ex.name}</Display>
        {ex.isCustom ? <Button compact variant="secondary" icon="create-outline" title="Edit" onPress={() => router.push({ pathname: '/exercise/edit', params: { id: ex.id } })} /> : null}
      </Row>
      <Row gap={6}>
        <Tag label={ex.primaryMuscle} tone="accent" />
        {secondary.map((m) => (
          <Tag key={m} label={m} />
        ))}
        <Tag label={ex.equipment} />
      </Row>
      <Card raised>
        <Row gap={8}>
          <Icon name="bulb-outline" size={20} color={t.accent} />
          <H2>How to</H2>
        </Row>
        <Body>{ex.cues || 'No cues yet.'}</Body>
      </Card>
      <Card>
        <Row gap={8}>
          <Icon name="videocam-outline" size={20} color={t.accent} />
          <H2>Video</H2>
        </Row>
        {editingLink != null ? (
          <>
            <Field value={editingLink} onChangeText={setEditingLink} placeholder="https://… (YouTube, Instagram, your own clip)" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            <Row>
              <Button compact title="Save" onPress={saveLink} />
              <Button compact variant="secondary" title="Cancel" onPress={() => setEditingLink(null)} />
            </Row>
          </>
        ) : ex.mediaUrl ? (
          <Row>
            <Button compact icon="play" title="Watch" onPress={() => openMediaLink(ex.mediaUrl)} />
            <Button compact variant="secondary" title="Change link" onPress={() => setEditingLink(ex.mediaUrl ?? '')} />
          </Row>
        ) : (
          <>
            <Small>Add a link to a demo video you trust, for example a coach&apos;s clip or a recording of your own form. It opens in your browser or the app it belongs to.</Small>
            <Button compact variant="secondary" icon="link" title="Add video link" onPress={() => setEditingLink('')} />
          </>
        )}
      </Card>
      <Card>
        <H2>Progress</H2>
        {progress.sessions.length ? (
          <>
            <StatStrip>
              <Stat value={progress.bestE1RM ? fmt(progress.bestE1RM.valueKg) : '–'} label="Best e1RM" />
              <Stat value={progress.heaviest ? `${fmt(progress.heaviest.weightKg)}×${progress.heaviest.reps}` : '–'} label="Heaviest" />
              <Stat value={String(progress.sessions.length)} label="Sessions" />
            </StatStrip>
            {chron.length > 1 ? <MiniBars values={chron.map((x) => x.e1rmKg)} labels={chron.map((x) => x.date.slice(5))} /> : null}
            <Small>Estimated 1RM per session (Epley, counting reps in reserve when you log RPE).</Small>
          </>
        ) : (
          <Body muted>Not logged yet. Default load step: {ex.defaultIncrementKg} kg.</Body>
        )}
      </Card>
      {progress.repRecords.length ? (
        <Card>
          <H2>Rep records</H2>
          {progress.repRecords.map((r) => (
            <Small key={r.reps} muted={false}>
              {r.reps} rep{r.reps > 1 ? 's' : ''}: {fmt(r.weightKg)} ({r.date})
            </Small>
          ))}
        </Card>
      ) : null}
      {progress.sessions.length ? (
        <Card>
          <H2>History</H2>
          {progress.sessions.slice(0, 15).map((x) => (
            <Small key={x.sessionId} muted={false}>
              {x.date}: {x.sets.map((s) => `${fmt(s.weightKg)}×${s.reps}${s.rpe ? `@${s.rpe}` : ''}`).join(', ')}
            </Small>
          ))}
        </Card>
      ) : null}
      {alts.length ? (
        <Card>
          <H2>Alternatives</H2>
          {alts.map((a) => (
            <ListRow
              key={a.id}
              leading={<ExerciseThumb exerciseId={a.id} equipment={a.equipment} />}
              title={a.name}
              subtitle={`${a.primaryMuscle} · ${a.equipment}`}
              onPress={() =>
                router.push({
                  pathname: '/exercise/[id]',
                  params: { id: a.id },
                })
              }
            />
          ))}
        </Card>
      ) : null}
      <Small>{MEDIA_CREDIT}</Small>
    </Screen>
  );
}
