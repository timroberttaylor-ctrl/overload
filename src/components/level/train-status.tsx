import { View } from 'react-native';

import { XP, type LevelProfile } from '@/core/leveling';
import { LevelColors as L, RankColors } from '@/constants/level-theme';

import { RankBadge } from './rank-badge';
import { HudText, SystemPanel, XpBar } from './system-panel';

export type DailyQuest = { name: string; reward: number; done: boolean } | { rest: true };

/** Train-tab status in Level Up mode: level, EXP to go, today's quest and the weekly quest. */
export function TrainStatus({ profile: p, quest, onPress }: { profile: LevelProfile; quest?: DailyQuest; onPress: () => void }) {
  const toGo = p.xpForNext - p.xpIntoLevel;
  const weekGoal = XP.weekClearSessions;
  const weekDone = Math.min(p.weekSessions, weekGoal);
  return (
    <SystemPanel title="Status" onPress={onPress} accessibilityLabel={`Level ${p.level}, ${p.rank.name}, ${toGo} EXP to next level. Open status`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RankBadge rank={p.rank.id} size={48} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <HudText size={22} color={L.text} weight="700">
              LV {p.level}
            </HudText>
            <HudText size={11} color={RankColors[p.rank.id]} weight="700">
              {p.rank.name.toUpperCase()}
            </HudText>
          </View>
          <XpBar value={p.progress} height={6} />
          <HudText size={10}>
            {toGo.toLocaleString()} EXP TO LV {p.level + 1}
            {p.activeTitle ? ` · ${p.activeTitle.toUpperCase()}` : ''}
          </HudText>
        </View>
      </View>

      {quest ? (
        <View style={{ borderTopWidth: 1, borderTopColor: L.panelEdge, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <HudText size={10} color={L.xp} weight="700">
              DAILY QUEST
            </HudText>
            <HudText size={13} color={L.text} weight="700">
              {'rest' in quest ? 'Recover. Rest day' : quest.done ? `${quest.name} · CLEARED` : `Complete ${quest.name}`}
            </HudText>
          </View>
          {'rest' in quest ? null : (
            <HudText size={13} color={quest.done ? L.dim : L.gold} weight="700">
              {quest.done ? `+${quest.reward}` : `≈ +${quest.reward}`}
            </HudText>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ gap: 4 }}>
          <HudText size={10}>WEEKLY QUEST · {weekGoal} WORKOUTS</HudText>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: weekGoal }, (_, i) => (
              <View
                key={i}
                style={{
                  width: 22,
                  height: 6,
                  borderRadius: 1,
                  backgroundColor: i < weekDone ? L.xp : L.xpTrack,
                  borderWidth: 1,
                  borderColor: i < weekDone ? L.xp : L.panelEdge,
                }}
              />
            ))}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <HudText size={10}>{weekDone >= weekGoal ? 'CLEARED' : `+${XP.weekClear} EXP`}</HudText>
          <HudText size={10} color={p.weekStreak ? L.gold : L.dim}>
            {p.weekStreak ? `STREAK ${p.weekStreak} WK` : 'NO STREAK'}
          </HudText>
        </View>
      </View>
    </SystemPanel>
  );
}
