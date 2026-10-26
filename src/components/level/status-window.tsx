import { View } from 'react-native';

import type { LevelProfile } from '@/core/leveling';
import { LevelColors as L, RankColors } from '@/constants/level-theme';

import { RankBadge } from './rank-badge';
import { HudText, SystemPanel, XpBar } from './system-panel';

/**
 * The status window: level, rank, title, XP to next level and the four stats.
 * `compact` is the Progress-tab version (tap through to the full Status screen).
 */
export function StatusWindow({ profile: p, compact, onPress }: { profile: LevelProfile; compact?: boolean; onPress?: () => void }) {
  const rankColour = RankColors[p.rank.id];
  return (
    <SystemPanel title="Status" onPress={onPress} accessibilityLabel={`Level ${p.level}, ${p.rank.name}. Open status`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <RankBadge rank={p.rank.id} size={compact ? 52 : 64} />
        <View style={{ flex: 1, gap: 2 }}>
          <HudText size={11}>LEVEL</HudText>
          <HudText size={compact ? 30 : 38} color={L.text} weight="700">
            {p.level}
          </HudText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 1 }}>
          <HudText size={11} color={rankColour} weight="700">
            {p.rank.name.toUpperCase()}
          </HudText>
          <HudText size={11}>TITLE</HudText>
          <HudText size={12} color={p.activeTitle ? L.gold : L.dim} weight="700" style={{ textAlign: 'right' }}>
            {p.activeTitle ?? '—'}
          </HudText>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <HudText size={11}>EXP</HudText>
          <HudText size={11} color={L.xp}>
            {p.xpIntoLevel.toLocaleString()} / {p.xpForNext.toLocaleString()}
          </HudText>
        </View>
        <XpBar value={p.progress} />
        {!compact && p.next ? (
          <HudText size={10}>
            {p.next.name.toUpperCase()} AT LEVEL {p.next.minLevel}
          </HudText>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
        {p.stats.map((s) => (
          <View key={s.key} style={{ width: compact ? '25%' : '50%', gap: 2 }}>
            <HudText size={10}>{compact ? s.key : `${s.key} · ${s.label.toUpperCase()}`}</HudText>
            <HudText size={compact ? 18 : 22} color={L.text} weight="700">
              {s.value}
            </HudText>
          </View>
        ))}
      </View>

      {compact ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <HudText size={10}>
            {p.weekStreak ? `WEEK STREAK ${p.weekStreak}` : 'NO ACTIVE STREAK'} · {p.titles.filter((t) => t.unlocked).length}/{p.titles.length} TITLES
          </HudText>
          <HudText size={10} color={L.xp}>
            OPEN ›
          </HudText>
        </View>
      ) : null}
    </SystemPanel>
  );
}
