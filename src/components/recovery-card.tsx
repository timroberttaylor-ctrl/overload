import { View } from 'react-native';

import { addDays } from '@/core/dates';
import type { HealthDay } from '@/db/repositories/health';
import { useTheme } from '@/hooks/use-theme';

import { MiniBars } from './mini-bars';
import { Card, Eyebrow, H2, Icon, Row, Small, Stat, StatStrip, Tag } from './ui';

const SOURCE_LABEL: Record<string, string> = { oura: 'Oura', sample: 'Sample data', healthconnect: 'Health Connect', healthkit: 'Apple Health', manual: 'Manual' };

/** Last night's recovery numbers plus a two-week HRV trend. */
export function RecoveryCard({ days, today }: { days: HealthDay[]; today: string }) {
  const t = useTheme();
  const latest = days[days.length - 1];
  // Nothing to show until wearable sync ships (post-launch); don't advertise a missing feature.
  if (!latest) return null;
  const recent = days.slice(-14);
  const hrv = recent.filter((d) => d.hrvMs != null);
  const baseline = hrv.length > 3 ? hrv.slice(0, -1).reduce((s, d) => s + d.hrvMs!, 0) / (hrv.length - 1) : null;
  const delta = baseline && latest.hrvMs ? Math.round(((latest.hrvMs - baseline) / baseline) * 100) : null;
  const stale = latest.date < today && latest.date !== addDays(today, -1);

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Icon name="pulse" size={20} color={t.accent} />
          <H2>Recovery</H2>
        </Row>
        <Tag label={SOURCE_LABEL[latest.source] ?? latest.source} tone={latest.source === 'sample' ? 'warning' : 'neutral'} />
      </Row>
      <Eyebrow>{latest.date === today ? 'Last night' : `Latest · ${latest.date}`}</Eyebrow>
      <StatStrip>
        <Stat value={latest.vendorReadiness != null ? String(Math.round(latest.vendorReadiness)) : '–'} label="Readiness" />
        <Stat value={latest.hrvMs != null ? `${Math.round(latest.hrvMs)}` : '–'} label="HRV ms" />
        <Stat value={latest.rhrBpm != null ? `${Math.round(latest.rhrBpm)}` : '–'} label="Rest HR" />
        <Stat value={latest.sleepHours != null ? `${Math.floor(latest.sleepHours)}h${String(Math.round((latest.sleepHours % 1) * 60)).padStart(2, '0')}` : '–'} label="Sleep" />
      </StatStrip>
      {hrv.length > 1 ? (
        <View style={{ gap: 4 }}>
          <Small>
            HRV, last {hrv.length} nights
            {delta != null ? ` · last night ${delta >= 0 ? '+' : ''}${delta}% vs average` : ''}
          </Small>
          <MiniBars values={hrv.map((d) => d.hrvMs!)} labels={hrv.map((d) => d.date.slice(5))} height={56} />
        </View>
      ) : null}
      {stale ? <Small style={{ color: t.warning }}>No new recovery data since {latest.date}.</Small> : null}
    </Card>
  );
}
