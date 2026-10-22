import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import { Body, Button, Card, Display, Eyebrow, H2, Icon, Row, Screen, Small, Stat, StatStrip } from '@/components/ui';
import { isoDate } from '@/core/dates';
import { formatWeight } from '@/core/units';
import { getDb } from '@/db/client';
import { blockSummary, startNextBlock } from '@/db/repositories/block';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

/** Volume in tonnes once it gets big, so the number stays readable. */
function formatVolume(kg: number, unit: 'kg' | 'lb'): string {
  if (unit === 'lb') {
    const lb = kg * 2.20462;
    return lb >= 10000 ? `${Math.round(lb / 1000)}k lb` : `${Math.round(lb)} lb`;
  }
  return kg >= 10000 ? `${(kg / 1000).toFixed(kg >= 100000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;
}

export default function ProgramCompleteScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data] = useDbQuery((db) => ({ s: blockSummary(db, id), unit: getSettings(db).units }));
  if (!data?.s) return null;
  const { s, unit } = data;

  const start = (templateId: string, deloadFirst: boolean) => {
    try {
      startNextBlock(getDb(), { templateId, date: isoDate(), deloadFirst });
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not start the program', e instanceof Error ? e.message : String(e));
    }
  };

  const attendance = s.sessionsPlanned ? Math.round((s.sessionsDone / s.sessionsPlanned) * 100) : 0;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: '' }} />
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="trophy" size={32} color={t.accentText} />
        </View>
        <Eyebrow color={t.accent}>Program complete</Eyebrow>
        <Display style={{ textAlign: 'center' }}>{s.template.name}</Display>
        <Small style={{ textAlign: 'center' }}>
          {s.template.weeks} weeks{s.firstDate && s.lastDate ? ` · ${s.firstDate} to ${s.lastDate}` : ''}
        </Small>
      </View>

      <Card>
        <StatStrip>
          <Stat value={`${s.sessionsDone}/${s.sessionsPlanned}`} label="Workouts" />
          <Stat value={formatVolume(s.volumeKg, unit)} label="Volume" />
          <Stat value={String(s.recordLifts)} label={s.recordLifts === 1 ? 'Lift with a PR' : 'Lifts with PRs'} />
        </StatStrip>
        <Small>
          {attendance >= 90
            ? `${attendance}% of planned workouts done. That consistency is what made this work.`
            : `${attendance}% of planned workouts done${s.sessionsPartial ? `, ${s.sessionsPartial} partly` : ''}. Every session counted toward the result.`}
        </Small>
      </Card>

      {s.lifts.length ? (
        <Card>
          <H2>Strength</H2>
          <Small>Estimated one-rep max, first session vs end of the block.</Small>
          {s.lifts.map((l) => (
            <Row key={l.exerciseId} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Body style={{ flex: 1 }}>{l.name}</Body>
              <Small>
                {formatWeight(l.startE1rmKg, unit)} → {formatWeight(l.endE1rmKg, unit)}
              </Small>
              <Body style={{ width: 64, textAlign: 'right', fontWeight: '800', color: l.changePct > 0 ? t.accent : t.textSecondary }}>
                {l.changePct > 0 ? '+' : ''}
                {Math.round(l.changePct)}%
              </Body>
            </Row>
          ))}
        </Card>
      ) : null}

      <Card raised>
        <H2>What next?</H2>
        <Small>Running a program again keeps your history, so every target picks up from the weights you finished on.</Small>
        <Button title="Run it again" icon="refresh" onPress={() => start(s.template.id, false)} />
        <Button title="Deload week first, then run it again" icon="bed-outline" variant="secondary" onPress={() => start(s.template.id, true)} />
        {s.stepUp ? <Button title={`Step up to ${s.stepUp.name}`} icon="trending-up" variant="secondary" onPress={() => start(s.stepUp!.id, false)} /> : null}
        <Button title="Choose a different program" variant="ghost" onPress={() => router.replace('/programs')} />
      </Card>
    </Screen>
  );
}
