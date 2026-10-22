import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { listExercises, listMuscles, type Exercise } from '@/db/repositories/exercises';
import { useTheme } from '@/hooks/use-theme';

import { Field, H2, Icon, ListRow, Pill, Row, Small } from './ui';

/** Full-screen exercise chooser with search and a muscle filter. */
export function ExercisePicker({ visible, title = 'Add exercise', onPick, onClose }: { visible: boolean; title?: string; onPick: (ex: Exercise) => void; onClose: () => void }) {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>();
  const items = visible ? listExercises(getDb(), { search, muscle }) : [];
  const muscles = visible ? listMuscles(getDb()) : [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
        <View style={{ padding: 16, gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>{title}</H2>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
              <Icon name="close" size={24} color={t.text} />
            </Pressable>
          </Row>
          <Field value={search} onChangeText={setSearch} placeholder="Search exercises" autoCorrect={false} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pill label="All" active={!muscle} onPress={() => setMuscle(undefined)} />
            {muscles.map((m) => (
              <Pill key={m} label={m} active={muscle === m} onPress={() => setMuscle(muscle === m ? undefined : m)} />
            ))}
          </ScrollView>
          <Small>{items.length} exercises</Small>
        </View>
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <ListRow
              icon={item.isCompound ? 'barbell-outline' : 'fitness-outline'}
              title={item.name}
              subtitle={`${item.primaryMuscle} · ${item.equipment}${item.isCustom ? ' · custom' : ''}`}
              onPress={() => {
                setSearch('');
                onPick(item);
              }}
            />
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
