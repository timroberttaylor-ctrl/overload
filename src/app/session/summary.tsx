import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { LevelReward } from '@/components/level/level-reward';
import { Body, Button, Card, Display, Eyebrow, H2, Icon, Row, Screen, Small, Stat, StatStrip } from '@/components/ui';
import { describePR } from '@/core/records';
import { formatWeight } from '@/core/units';
import { sessionXp } from '@/db/repositories/leveling';
import { getSessionSummary } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

export default function SummaryScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data] = useDbQuery((db) => {
    const settings = getSettings(db);
    return { summary: getSessionSummary(db, id), unit: settings.units, reward: settings.levelMode ? sessionXp(db, id) : undefined };
  });
  if (!data?.summary) return null;
  const { summary: s, unit, reward } = data;
  const fmt = (kg: number) => formatWeight(kg, unit);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: s.status === 'completed' ? t.accent : t.warning, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={s.status === 'completed' ? 'checkmark' : 'remove'} size={34} color={t.accentText} />
        </View>
        <Eyebrow color={s.status === 'completed' ? t.accent : t.warning}>{s.status === 'completed' ? 'Workout complete' : 'Saved as partial'}</Eyebrow>
        <Display style={{ textAlign: 'center' }}>{s.prs.length ? `${s.prs.length} new PR${s.prs.length > 1 ? 's' : ''}` : 'Nice work'}</Display>
      </View>

      <Card raised>
        <StatStrip>
          <Stat value={String(s.durationMin)} label="Minutes" />
          <Stat value={`${s.workingSetsDone}/${s.workingSetsPlanned}`} label="Sets" />
          <Stat value={fmt(s.volumeKg).replace(` ${unit}`, '')} label={`Volume ${unit}`} />
        </StatStrip>
      </Card>

      {reward ? <LevelReward reward={reward} /> : null}

      {s.prs.length ? (
        <Card style={{ borderColor: t.accent, borderWidth: 1 }}>
          <Row gap={8}>
            <Icon name="trophy" size={20} color={t.accent} />
            <H2>Personal records</H2>
          </Row>
          {s.prs.map((p, i) => (
            <View key={i} style={{ gap: 2 }}>
              <Body style={{ fontWeight: '700' }}>{p.exerciseName}</Body>
              <Small>{describePR(p.pr, fmt)}</Small>
            </View>
          ))}
        </Card>
      ) : (
        <Card>
          <Small>No new records this time. Records compare against everything you logged before this workout.</Small>
        </Card>
      )}

      {s.next.length ? (
        <Card>
          <Row gap={8}>
            <Icon name="trending-up" size={20} color={t.accent} />
            <H2>Next time</H2>
          </Row>
          {s.next.map((n, i) => (
            <View key={i} style={{ gap: 2, paddingVertical: 4 }}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Body style={{ fontWeight: '700', flex: 1 }}>{n.exerciseName}</Body>
                <Body style={{ color: t.accent, fontWeight: '600' }}>{n.target.weightKg != null ? `${fmt(n.target.weightKg)} × ${n.target.reps.join('/')}` : 'choose'}</Body>
              </Row>
              <Small>{n.target.reason}</Small>
            </View>
          ))}
        </Card>
      ) : null}

      <Button title="Done" onPress={() => router.navigate('/')} />
      {reward ? <Button title="View status" variant="secondary" icon="flash-outline" onPress={() => router.push('/level')} /> : null}
      <Button title="View or edit the log" variant="ghost" onPress={() => router.replace({ pathname: '/session/[id]', params: { id: s.sessionId } })} />
    </Screen>
  );
}
