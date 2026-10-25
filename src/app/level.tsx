import { Stack, router } from 'expo-router';
import { View } from 'react-native';

import { RankBadge } from '@/components/level/rank-badge';
import { StatusWindow } from '@/components/level/status-window';
import { HudText, SystemPanel, XpBar } from '@/components/level/system-panel';
import { Button, Screen } from '@/components/ui';
import { RANKS, XP, STREAK_SESSIONS } from '@/core/leveling';
import { LevelColors as L, RankColors } from '@/constants/level-theme';
import { getLevelProfile } from '@/db/repositories/leveling';
import { getSettings } from '@/db/repositories/settings';
import { useDbQuery } from '@/hooks/use-db-query';

const RULES: [string, string][] = [
  ['Finish a workout', `+${XP.completed} (partial +${XP.partial})`],
  ['Each working set', `+${XP.perSet}`],
  ['Each 1,000 kg moved', `+${XP.perTonne} (max ${XP.tonneCap})`],
  ['Each personal record', `+${XP.pr} (max ${XP.prCap})`],
  [`Weekly quest: ${XP.weekClearSessions} workouts in a week`, `+${XP.weekClear}`],
];

export default function LevelScreen() {
  const [data] = useDbQuery((db) => ({ on: getSettings(db).levelMode, profile: getLevelProfile(db) }));
  if (!data) return null;
  const { on, profile: p } = data;

  return (
    <>
      <Stack.Screen options={{ title: 'Status' }} />
      <Screen edges={[]}>
        {!on ? (
          <SystemPanel title="Level Up mode is off">
            <HudText size={12}>TURN IT ON IN SETTINGS TO SEE YOUR LEVEL.</HudText>
            <Button compact title="Open Settings" onPress={() => router.navigate('/settings')} />
          </SystemPanel>
        ) : (
          <>
            <StatusWindow profile={p} />

            <SystemPanel title="Record">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
                {[
                  ['WORKOUTS', p.sessions.toLocaleString()],
                  ['TOTAL EXP', p.totalXp.toLocaleString()],
                  ['RECORDS', p.prs.toLocaleString()],
                  ['TONNES MOVED', (p.volumeKg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })],
                  ['WEEK STREAK', String(p.weekStreak)],
                  ['BEST STREAK', String(p.bestWeekStreak)],
                ].map(([k, v]) => (
                  <View key={k} style={{ width: '50%', gap: 2 }}>
                    <HudText size={10}>{k}</HudText>
                    <HudText size={18} color={L.text} weight="700">
                      {v}
                    </HudText>
                  </View>
                ))}
              </View>
              <HudText size={10}>
                A STREAK WEEK IS {STREAK_SESSIONS}+ WORKOUTS. REST WEEKS NEVER COST EXP.
              </HudText>
            </SystemPanel>

            <SystemPanel title="Ranks">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {RANKS.map((r) => {
                  const reached = p.level >= r.minLevel;
                  return (
                    <View key={r.id} style={{ alignItems: 'center', gap: 2 }}>
                      <RankBadge rank={r.id} size={42} dimmed={!reached} />
                      <HudText size={9} color={reached ? RankColors[r.id] : L.locked}>
                        LV {r.minLevel}
                      </HudText>
                    </View>
                  );
                })}
              </View>
            </SystemPanel>

            <SystemPanel title="Titles">
              {p.titles.map((t) => (
                <View key={t.id} style={{ gap: 4, opacity: t.unlocked ? 1 : 0.75 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <HudText size={13} color={t.unlocked ? L.gold : L.dim} weight="700" style={{ flex: 1 }}>
                      {t.unlocked ? '◆' : '◇'} {t.name}
                    </HudText>
                    <HudText size={10}>{t.unlockedOn ?? `${Math.floor(t.progress * 100)}%`}</HudText>
                  </View>
                  <HudText size={10}>{t.description.toUpperCase()}</HudText>
                  {!t.unlocked ? <XpBar value={t.progress} height={4} color={L.gold} /> : null}
                </View>
              ))}
            </SystemPanel>

            <SystemPanel title="Quest log">
              {p.log.length ? (
                p.log.slice(0, 20).map((q) => (
                  <View key={q.sessionId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <HudText size={12} color={L.text} weight="700">
                        {q.name}
                      </HudText>
                      <HudText size={10}>
                        {q.date}
                        {q.levelAfter > q.levelBefore ? ` · LEVEL ${q.levelAfter}` : ''}
                        {q.titles.length ? ` · ${q.titles.join(', ').toUpperCase()}` : ''}
                      </HudText>
                    </View>
                    <HudText size={13} color={q.levelAfter > q.levelBefore ? L.gold : L.xp} weight="700">
                      +{q.xp}
                    </HudText>
                  </View>
                ))
              ) : (
                <HudText size={12}>NO QUESTS YET. FINISH A WORKOUT TO EARN EXP.</HudText>
              )}
            </SystemPanel>

            <SystemPanel title="How EXP works">
              {RULES.map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <HudText size={11} style={{ flex: 1 }}>
                    {k.toUpperCase()}
                  </HudText>
                  <HudText size={11} color={L.text}>
                    {v}
                  </HudText>
                </View>
              ))}
              <HudText size={10}>
                STATS: STR FROM HEAVY COMPOUND SETS AND RECORDS · END FROM TOTAL REPS · DIS FROM DAYS TRAINED · CON FROM WEEKLY QUESTS CLEARED. LEVELS ARE WORKED OUT FROM YOUR LOG, SO PAST TRAINING COUNTS AND NOTHING ABOUT YOUR PROGRAM CHANGES.
              </HudText>
            </SystemPanel>
          </>
        )}
      </Screen>
    </>
  );
}
