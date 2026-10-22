import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import { formatWeight, type WeightUnit } from '@/core/units';
import type { ExerciseHistory } from '@/db/repositories/sessions';
import { useTheme } from '@/hooks/use-theme';

import { Body, Card, H2, Icon, Pill, Row, Small, Stat, StatStrip } from './ui';

/** Mid-workout history: recent sessions in this program or all-time, plus bests. */
export function HistorySheet({ visible, title, history, unit, onClose }: { visible: boolean; title: string; history: ExerciseHistory | null; unit: WeightUnit; onClose: () => void }) {
  const t = useTheme();
  const [tab, setTab] = useState<'program' | 'all'>('program');
  const fmt = (kg: number) => formatWeight(kg, unit);
  const list = history ? (tab === 'program' && history.inProgram.length ? history.inProgram : history.allTime) : [];
  const showingProgram = tab === 'program' && !!history?.inProgram.length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top', 'bottom']}>
        <Row style={{ justifyContent: 'space-between', padding: 16, flexWrap: 'nowrap' }}>
          <View style={{ flex: 1 }}>
            <Small>History</Small>
            <H2>{title}</H2>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close history" hitSlop={12} style={{ padding: 6 }}>
            <Icon name="close" size={26} />
          </Pressable>
        </Row>
        <FlatList
          data={list}
          keyExtractor={(s) => s.sessionId}
          contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
          ListHeaderComponent={
            history ? (
              <View style={{ gap: 10, marginBottom: 4 }}>
                <Card>
                  <StatStrip>
                    <Stat value={history.bestE1RM ? fmt(history.bestE1RM.valueKg) : '–'} label="Best e1RM" />
                    <Stat value={history.heaviest ? `${fmt(history.heaviest.weightKg)} × ${history.heaviest.reps}` : '–'} label="Heaviest set" />
                  </StatStrip>
                  {history.repRecords.length ? (
                    <Small>
                      Rep bests: {history.repRecords.slice(0, 6).map((r) => `${r.reps}× ${fmt(r.weightKg)}`).join(' · ')}
                    </Small>
                  ) : null}
                </Card>
                <Row>
                  <Pill label="This program" active={tab === 'program'} onPress={() => setTab('program')} />
                  <Pill label="All time" active={tab === 'all'} onPress={() => setTab('all')} />
                </Row>
                {tab === 'program' && !history.inProgram.length ? <Small>Nothing logged in this program yet, so here is everything.</Small> : null}
              </View>
            ) : undefined
          }
          ListEmptyComponent={<Body muted>No history yet. Today&apos;s sets will be the first.</Body>}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: t.border }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontWeight: '700' }}>{item.date}</Body>
                <Small>{showingProgram ? '' : `e1RM ${fmt(item.e1rmKg)}`}</Small>
              </Row>
              <Small style={{ color: t.text }}>{item.sets.map((s) => `${fmt(s.weightKg)} × ${s.reps}${s.rpe ? ` @${s.rpe}` : ''}`).join(',  ')}</Small>
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
