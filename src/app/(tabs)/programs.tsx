import { router } from 'expo-router';
import { View } from 'react-native';

import { Body, Button, Card, Eyebrow, H1, H2, Icon, Row, Screen, Small, Stat, StatStrip, Tag } from '@/components/ui';
import { getActiveEnrolment } from '@/db/repositories/enrolments';
import { listTemplates } from '@/db/repositories/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { useTheme } from '@/hooks/use-theme';

export const METHOD_LABEL = { linear: 'Linear progression', double: 'Double progression', rpe: 'RPE-based', block: 'Block periodisation' } as const;

export default function ProgramsScreen() {
  const t = useTheme();
  const [data] = useDbQuery((db) => ({
    // Your own programs first
    templates: [...listTemplates(db)].sort((a, b) => Number(b.isCustom) - Number(a.isCustom)),
    active: getActiveEnrolment(db),
  }));
  if (!data) return null;
  return (
    <Screen>
      <View>
        <Eyebrow color={t.accent}>Programs</Eyebrow>
        <H1>Find your plan</H1>
        <Small>Every program sets your targets and moves them up as you progress.</Small>
      </View>
      <Button title="Build your own program" icon="construct-outline" variant="secondary" onPress={() => router.push('/program/edit')} />
      {data.templates.map((p) => {
        const active = data.active?.templateId === p.id;
        return (
          <Card key={p.id} raised onPress={() => router.push({ pathname: '/program/[id]', params: { id: p.id } })} style={active ? { borderColor: t.accent, borderWidth: 1 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={6}>
                {p.isCustom ? <Tag label="Yours" tone="accent" /> : null}
                <Tag label={p.level} tone={p.level === 'advanced' ? 'warning' : 'neutral'} />
                <Tag label={METHOD_LABEL[p.method]} />
              </Row>
              {active ? <Tag label="Active" tone="accent" /> : <Icon name="chevron-forward" size={18} color={t.textSecondary} />}
            </Row>
            <H2 style={{ fontSize: 22 }}>{p.name}</H2>
            <Body muted>{p.summary}</Body>
            <StatStrip>
              <Stat value={String(p.daysPerWeek)} label="Days / wk" />
              <Stat value={String(p.weeks)} label="Weeks" />
              <Stat value={`~${p.minutes}`} label="Minutes" />
            </StatStrip>
          </Card>
        );
      })}
    </Screen>
  );
}
