import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Eyebrow, Field, H1, ListRow, Pill, Row, Small } from '@/components/ui';
import { listExercises, listMuscles } from '@/db/repositories/exercises';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

export default function LibraryScreen() {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string>();
  const [mine, setMine] = useState(false);
  const [data] = useDbQuery((db) => ({
    items: listExercises(db, { search, muscle, customOnly: mine }),
    muscles: listMuscles(db),
  }));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 96 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12, paddingTop: 16, paddingBottom: 4 }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <View>
                <Eyebrow color={t.accent}>Library</Eyebrow>
                <H1>Exercises</H1>
              </View>
              <Button compact icon="add" title="New" onPress={() => router.push('/exercise/edit')} />
            </Row>
            <Field value={search} onChangeText={setSearch} placeholder="Search exercises" autoCorrect={false} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pill
                label="All"
                active={!muscle && !mine}
                onPress={() => {
                  setMuscle(undefined);
                  setMine(false);
                }}
              />
              <Pill label="My exercises" icon="person-outline" active={mine} onPress={() => setMine((v) => !v)} />
              {(data?.muscles ?? []).map((m) => (
                <Pill key={m} label={m} active={muscle === m} onPress={() => setMuscle(muscle === m ? undefined : m)} />
              ))}
            </ScrollView>
            <Small>{data?.items.length ?? 0} exercises</Small>
          </View>
        }
        renderItem={({ item }) => (
          <ListRow
            icon={item.isCompound ? 'barbell-outline' : 'fitness-outline'}
            title={item.name}
            subtitle={`${item.primaryMuscle} · ${item.equipment}${item.isCustom ? ' · custom' : ''}`}
            onPress={() =>
              router.push({
                pathname: '/exercise/[id]',
                params: { id: item.id },
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}
