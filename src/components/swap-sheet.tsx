import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listExercises, suggestAlternatives, type Exercise } from '@/db/repositories/exercises';
import type { DB } from '@/db/types';
import { getDb } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';

import { ExerciseThumb } from './exercise-thumb';
import { Body, Button, Card, Field, H2, Icon, Pill, Row, Small } from './ui';

function load(db: DB, exerciseId: string, q: string): Exercise[] {
  return q.trim() ? listExercises(db, { search: q }).filter((e) => e.id !== exerciseId) : suggestAlternatives(db, exerciseId, 12);
}

export function SwapSheet({ visible, exercise, allowProgram, onClose, onPick }: { visible: boolean; exercise: Exercise | null; allowProgram: boolean; onClose: () => void; onPick: (toId: string, scope: 'session' | 'program') => void }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'session' | 'program'>('session');
  const items = exercise && visible ? load(getDb(), exercise.id, q) : [];
  const close = () => {
    setQ('');
    onClose();
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={['top', 'bottom']}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', paddingHorizontal: 16, paddingTop: 8 }}>
          <H2 style={{ flex: 1 }}>Swap {exercise?.name}</H2>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close without swapping" hitSlop={12} style={{ padding: 6 }}>
            <Icon name="close" size={26} />
          </Pressable>
        </Row>
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              {allowProgram ? (
                <Row>
                  <Pill label="This workout only" active={scope === 'session'} onPress={() => setScope('session')} />
                  <Pill label="Whole program" active={scope === 'program'} onPress={() => setScope('program')} />
                </Row>
              ) : null}
              <Field value={q} onChangeText={setQ} placeholder="Search all exercises" autoCorrect={false} />
              <Small>{q ? 'Search results' : 'Same muscle or movement'}</Small>
            </View>
          }
          renderItem={({ item }) => (
            <Card
              onPress={() => {
                setQ('');
                onPick(item.id, scope);
              }}>
              <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                <ExerciseThumb exerciseId={item.id} equipment={item.equipment} />
                <View style={{ flex: 1 }}>
                  <Body>{item.name}</Body>
                  <Small>
                    {item.primaryMuscle} · {item.equipment}
                  </Small>
                </View>
              </Row>
            </Card>
          )}
        />
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: t.border }}>
          <Button title="Cancel, keep the current exercise" variant="secondary" onPress={close} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
