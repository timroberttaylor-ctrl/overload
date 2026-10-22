import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { DayPlanList } from '@/components/day-plan';
import { Body, Button, Card, Display, Eyebrow, H2, Icon, Row, Screen, Small, Stat, StatStrip, Tag } from '@/components/ui';
import { isoDate } from '@/core/dates';
import { getDb } from '@/db/client';
import { copyProgram } from '@/db/repositories/builder';
import { getActiveEnrolment, startProgram } from '@/db/repositories/enrolments';
import { getTemplateDetail, setsForPhase } from '@/db/repositories/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

const PHASE_LABEL: Record<string, string> = { accumulation: 'Build', intensification: 'Intensify', realisation: 'Peak', deload: 'Deload' };

export default function ProgramDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [open, setOpen] = useState<number | null>(null);
  const [data] = useDbQuery((db) => ({ detail: getTemplateDetail(db, id), active: getActiveEnrolment(db) }));
  if (!data?.detail) return null;
  const { template, phases, days } = data.detail;
  const isActive = data.active?.templateId === template.id;

  const start = () => {
    const go = () => {
      startProgram(getDb(), template.id, isoDate());
      router.navigate('/');
    };
    if (data.active && !isActive) {
      Alert.alert('Switch program?', 'Your current program will end. Everything you logged is kept.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', style: 'destructive', onPress: go },
      ]);
    } else if (isActive) {
      Alert.alert('Restart this program?', 'You will start again from day 1. Everything you logged is kept.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', style: 'destructive', onPress: go },
      ]);
    } else go();
  };

  return (
    <Screen edges={[]}>
      <View style={{ gap: 8 }}>
        <Row gap={6}>
          <Tag label={template.level} tone={template.level === 'advanced' ? 'warning' : 'neutral'} />
          {isActive ? <Tag label="Active" tone="accent" /> : null}
        </Row>
        <Display>{template.name}</Display>
        <Body muted>{template.summary}</Body>
      </View>
      <StatStrip>
        <Stat value={String(template.daysPerWeek)} label="Days / wk" />
        <Stat value={String(template.weeks)} label="Weeks" />
        <Stat value={`~${template.minutes}`} label="Minutes" />
      </StatStrip>

      <Card raised>
        <Row gap={8}>
          <Icon name="person-circle-outline" size={20} color={t.accent} />
          <H2>Who it&apos;s for</H2>
        </Row>
        <Body muted>{template.rationale}</Body>
      </Card>

      <View style={{ gap: 8 }}>
        <Eyebrow>Phases</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {phases.map((p) => (
            <View key={p.id} style={{ flex: p.weekTo - p.weekFrom + 1, gap: 4 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: p.kind === 'deload' ? t.backgroundSelected : p.kind === 'intensification' ? t.warning : t.accent }} />
              <Small>
                {PHASE_LABEL[p.kind]} · wk {p.weekFrom}
                {p.weekTo !== p.weekFrom ? `–${p.weekTo}` : ''}
              </Small>
            </View>
          ))}
        </View>
      </View>

      <Button title={isActive ? 'Restart program' : 'Start program'} icon={isActive ? 'refresh' : 'play'} onPress={start} variant={isActive ? 'secondary' : 'primary'} />
      <Row>
        {template.isCustom ? (
          <Button compact variant="secondary" icon="create-outline" title="Edit program" onPress={() => router.push({ pathname: '/program/edit', params: { id: template.id } })} style={{ flex: 1 }} />
        ) : null}
        <Button
          compact
          variant="ghost"
          icon="copy-outline"
          title={template.isCustom ? 'Duplicate' : 'Copy and customise'}
          style={{ flex: 1 }}
          onPress={() => {
            try {
              const newId = copyProgram(getDb(), template.id);
              router.push({ pathname: '/program/edit', params: { id: newId } });
            } catch (e) {
              Alert.alert('Copy program', e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </Row>

      <Eyebrow>Weekly cycle</Eyebrow>
      {days.map(({ day, slots }) => (
        <Card key={day.id}>
          <Pressable onPress={() => setOpen(open === day.dayIndex ? null : day.dayIndex)} disabled={day.isRest} accessibilityRole="button">
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Row gap={12} style={{ flex: 1, flexWrap: 'nowrap' }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: day.isRest ? t.backgroundSelected : t.accentDim, alignItems: 'center', justifyContent: 'center' }}>
                  {day.isRest ? <Icon name="moon" size={16} color={t.textSecondary} /> : <Small style={{ color: t.accent, fontWeight: '900' }}>D{day.dayIndex + 1}</Small>}
                </View>
                <View style={{ flex: 1 }}>
                  <H2>{day.isRest ? 'Rest' : day.name}</H2>
                  {!day.isRest ? <Small>{day.focus}</Small> : null}
                </View>
              </Row>
              {!day.isRest ? <Icon name={open === day.dayIndex ? 'chevron-up' : 'chevron-down'} size={18} color={t.textSecondary} /> : null}
            </Row>
          </Pressable>
          {open === day.dayIndex ? (
            <View style={{ marginTop: 8 }}>
              <DayPlanList
                slots={slots.map(({ slot, exercise }) => ({ slot, exercise, workingSets: setsForPhase(slot.sets, 1), targetRpe: slot.targetRpe }))}
                onOpenExercise={(exId) => router.push({ pathname: '/exercise/[id]', params: { id: exId } })}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
