import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { shortDate, WeightChart } from '@/components/weight-chart';
import { Body, Button, Card, Display, Field, H2, Icon, Pill, Row, Screen, SectionHeader, Small, Stat, StatStrip } from '@/components/ui';
import { inRange, RANGES, weightStats, withTrend, type RangeId } from '@/core/bodyweight';
import { isoDate } from '@/core/dates';
import { formatWeight, kgToDisplay, parseWeightInput, type WeightUnit } from '@/core/units';
import { getDb } from '@/db/client';
import { deleteBodyweight, listBodyweights, logBodyweight } from '@/db/repositories/body';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

function signed(kg: number, unit: WeightUnit, digits = 1, withUnit = true): string {
  const v = kgToDisplay(kg, unit);
  const r = Number(Math.abs(v).toFixed(digits));
  return `${r === 0 ? '±' : v > 0 ? '+' : '−'}${r}${withUnit ? ` ${unit}` : ''}`;
}

export default function BodyWeightScreen() {
  const t = useTheme();
  const today = isoDate();
  const [range, setRange] = useState<RangeId>('3m');
  const [text, setText] = useState('');
  const [data, refresh] = useDbQuery((db) => ({ all: listBodyweights(db).map((b) => ({ date: b.date, kg: b.kg })), unit: getSettings(db).units }));
  if (!data) return null;
  const { all, unit } = data;

  // Trend is worked out on the full history so the start of a range isn't skewed.
  const trend = withTrend(all);
  const shown = inRange(trend, range, today) as typeof trend;
  const stats = weightStats(shown);
  const loggedToday = all.some((e) => e.date === today);

  const save = () => {
    const kg = parseWeightInput(text, unit);
    try {
      if (kg == null) throw new Error('Enter a weight');
      logBodyweight(getDb(), today, kg);
      setText('');
      refresh();
    } catch (e) {
      Alert.alert('Body weight', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (date: string) =>
    Alert.alert('Delete weigh-in?', shortDate(date, true), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteBodyweight(getDb(), date);
          refresh();
        },
      },
    ]);

  const history = [...all].reverse();

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Body weight' }} />

      <Card raised>
        <Small>{loggedToday ? 'Today' : all.length ? `Last weigh-in ${shortDate(all[all.length - 1].date, true)}` : 'No weigh-ins yet'}</Small>
        <Display>{all.length ? formatWeight(all[all.length - 1].kg, unit) : '–'}</Display>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Field value={text} onChangeText={setText} placeholder={loggedToday ? `Update today (${unit})` : `Today (${unit})`} keyboardType="decimal-pad" style={{ flex: 1 }} onSubmitEditing={save} />
          <Button title={loggedToday ? 'Update' : 'Log'} compact onPress={save} disabled={!text} />
        </Row>
        <Small>One weigh-in per day; logging again today replaces it. Weigh at the same time each day, ideally in the morning, for the cleanest trend.</Small>
      </Card>

      {all.length ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Trend</H2>
            <Row gap={6}>
              {RANGES.map((r) => (
                <Pill key={r.id} label={r.label} active={range === r.id} onPress={() => setRange(r.id)} />
              ))}
            </Row>
          </Row>
          {shown.length >= 2 ? (
            <WeightChart key={range} points={shown} unit={unit} />
          ) : (
            <Body muted>{shown.length ? 'Log another day to draw your trend.' : 'No weigh-ins in this period.'}</Body>
          )}
          {stats && shown.length >= 2 ? (
            <StatStrip>
              <Stat value={signed(stats.changeKg, unit, 1, false)} label={`Change ${unit}`} />
              <Stat value={stats.perWeekKg == null ? '–' : signed(stats.perWeekKg, unit, 2, false)} label={`${unit} / week`} />
              <Stat value={formatWeight(stats.minKg, unit).replace(` ${unit}`, '')} label={`Lowest ${unit}`} />
            </StatStrip>
          ) : null}
          <Small>Dots are your weigh-ins; the line is the 7-day average, which smooths out day-to-day water and food swings. Tap the chart to read a day.</Small>
        </Card>
      ) : null}

      {history.length ? (
        <>
          <SectionHeader title="History" />
          <Card>
            {history.map((e, i) => {
              const prev = history[i + 1];
              return (
                <View key={e.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < history.length - 1 ? 0.5 : 0, borderColor: t.border }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body style={{ fontWeight: '600' }}>{formatWeight(e.kg, unit)}</Body>
                    <Small>{shortDate(e.date, true)}</Small>
                  </View>
                  {prev ? <Small style={{ color: e.kg > prev.kg ? t.warning : e.kg < prev.kg ? t.accent : t.textSecondary }}>{signed(e.kg - prev.kg, unit)}</Small> : null}
                  <Pressable onPress={() => remove(e.date)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete weigh-in ${e.date}`}>
                    <Icon name="trash-outline" size={18} color={t.textSecondary} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
