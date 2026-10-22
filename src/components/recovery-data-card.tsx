import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { isoDate } from '@/core/dates';
import { getDb } from '@/db/client';
import { countHealthDays, removeHealthSource, upsertHealthDays } from '@/db/repositories/health';
import { generateSampleRecovery } from '@/integrations/sample';
import { useTheme } from '@/hooks/use-theme';

import { Body, Button, Card, H2, Icon, Row, Small, Tag } from './ui';

/** Recovery data source settings. Wearable sync (Oura etc.) is a post-launch feature. */
export function RecoveryDataCard() {
  const t = useTheme();
  const [sample, setSample] = useState(0);
  const load = useCallback(() => setSample(countHealthDays(getDb(), 'sample')), []);
  useFocusEffect(load);

  const run = (label: string, fn: () => void, msg?: string) => {
    try {
      fn();
      if (msg) Alert.alert(label, msg);
    } catch (e) {
      Alert.alert(label, e instanceof Error ? e.message : String(e));
    }
    load();
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Icon name="pulse" size={20} color={t.accent} />
          <H2>Recovery data</H2>
        </Row>
        <Tag label="Wearables after launch" />
      </Row>
      <Body muted>Syncing readiness, sleep and HRV from a wearable such as Oura is planned for after launch.</Body>
      <Small>To try the Recovery card now, load 60 days of made-up data. It is labelled as sample data and can be removed at any time.</Small>
      <Row>
        <Button
          compact
          variant="secondary"
          icon="flask-outline"
          title={sample ? 'Reload sample data' : 'Load sample data'}
          onPress={() => run('Sample data', () => upsertHealthDays(getDb(), 'sample', generateSampleRecovery(isoDate(), 60)), 'Loaded 60 days of sample recovery data.')}
        />
        {sample ? <Button compact variant="ghost" title="Remove sample data" onPress={() => run('Sample data', () => removeHealthSource(getDb(), 'sample'))} /> : null}
      </Row>
    </Card>
  );
}
