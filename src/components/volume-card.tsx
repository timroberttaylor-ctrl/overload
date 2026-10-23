import { Text, View } from 'react-native';

import { GROUP_LABEL, GROUP_TARGET, MUSCLE_GROUPS, groupStatus, volumeHint, type Volume } from '@/core/volume';
import { muscleCode } from '@/constants/colour-codes';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

import { Card, H2, Icon, Row, Small } from './ui';

/**
 * Sets per muscle group for a week: a bar for sets done, a tick for sets planned,
 * and a shaded band for the usual weekly range. Hints call out under-trained muscles.
 */
export function VolumeCard({ title, done, planned, footnote }: { title: string; done: Volume; planned?: Volume; footnote?: string }) {
  const t = useTheme();
  const scheme = useSchemeName();
  const groups = MUSCLE_GROUPS.filter((g) => done[g] > 0 || (planned?.[g] ?? 0) > 0);
  if (!groups.length) return null;
  const scaleMax = Math.max(22, ...groups.map((g) => Math.max(done[g], planned?.[g] ?? 0)));
  const pct = (n: number) => `${Math.min(100, (n / scaleMax) * 100)}%` as const;
  // Hints use the planned week when there is one (what you'll do), otherwise what you did.
  const basis = planned ?? done;
  const hints = groups.map((g) => volumeHint(g, basis[g])).filter((h): h is string => !!h);
  const low = groups.filter((g) => groupStatus(g, basis[g]) === 'low');

  return (
    <Card>
      <H2>{title}</H2>
      <View style={{ gap: 10 }}>
        {groups.map((g) => {
          const target = GROUP_TARGET[g];
          const status = groupStatus(g, basis[g]);
          const mc = muscleCode(g, scheme);
          const color = mc.solid;
          return (
            <View
              key={g}
              style={{ gap: 4 }}
              accessible
              accessibilityLabel={`${GROUP_LABEL[g]}: ${done[g]} sets done${planned ? ` of ${planned[g]} planned` : ''}; usual range ${target.min} to ${target.max}`}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={6}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mc.solid }} />
                  <Text style={{ color: t.text, fontWeight: '600', fontSize: 13 }}>{GROUP_LABEL[g]}</Text>
                  {status === 'low' ? <Icon name="alert-circle" size={13} color={t.warning} /> : null}
                </Row>
                <Text style={{ color: status === 'low' ? t.warning : t.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                  {done[g]}
                  {planned ? ` / ${planned[g]}` : ''} sets
                </Text>
              </Row>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: t.backgroundSelected, overflow: 'hidden' }}>
                {/* usual weekly range */}
                <View style={{ position: 'absolute', left: pct(target.min), width: `${((target.max - target.min) / scaleMax) * 100}%`, top: 0, bottom: 0, backgroundColor: t.text + '14' }} />
                {/* done */}
                <View style={{ width: pct(done[g]), height: '100%', borderRadius: 5, backgroundColor: color }} />
                {/* planned */}
                {planned && planned[g] > 0 ? <View style={{ position: 'absolute', left: pct(planned[g]), top: 0, bottom: 0, width: 2, backgroundColor: t.text }} /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <Small>Bar = sets done{planned ? ', line = planned this week' : ''}, shaded = the usual weekly range for that muscle. Secondary muscles count as half a set.</Small>
      {hints.length ? (
        <View style={{ gap: 4 }}>
          {hints.map((h) => (
            <Row key={h} gap={6} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <Icon name="alert-circle-outline" size={15} color={h.includes('below') ? t.warning : t.textSecondary} />
              <Small style={{ flex: 1, color: t.text }}>{h}</Small>
            </Row>
          ))}
          {low.length ? <Small>A push week from the planner adds sets to the most under-trained muscles first.</Small> : null}
        </View>
      ) : null}
      {footnote ? <Small>{footnote}</Small> : null}
    </Card>
  );
}
