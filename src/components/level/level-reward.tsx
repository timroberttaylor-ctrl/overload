import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import type { SessionXp } from '@/core/leveling';
import { LevelColors as L, RankColors } from '@/constants/level-theme';

import { RankBadge } from './rank-badge';
import { HudText, SystemPanel } from './system-panel';

/** Shown on the workout summary in Level Up mode: XP earned and any level, rank or title gained. */
export function LevelReward({ reward: r }: { reward: SessionXp }) {
  const [appear] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));
  const leveled = r.levelAfter > r.levelBefore;
  const ranked = r.rankAfter !== r.rankBefore;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    if (leveled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        { iterations: 3 },
      ).start();
    }
  }, [appear, pulse, leveled]);

  const scale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <Animated.View style={{ opacity: appear, transform: [{ scale }] }}>
      <SystemPanel title={leveled ? 'Level up' : 'Quest complete'} accent={leveled ? L.gold : L.frame}>
        {leveled ? (
          <Animated.View style={{ alignItems: 'center', gap: 6, transform: [{ scale: glow }] }}>
            {ranked ? <RankBadge rank={r.rankAfter} size={72} /> : null}
            <HudText size={34} color={L.gold} weight="700">
              LV {r.levelBefore} → {r.levelAfter}
            </HudText>
            {ranked ? (
              <HudText size={13} color={RankColors[r.rankAfter]} weight="700">
                RANK UP: {r.rankBefore} → {r.rankAfter}
              </HudText>
            ) : null}
          </Animated.View>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <HudText size={11}>EXP GAINED</HudText>
          <HudText size={24} color={L.xp} weight="700">
            +{r.xp.toLocaleString()}
          </HudText>
        </View>
        <View style={{ gap: 4 }}>
          {r.parts.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <HudText size={11} style={{ flex: 1 }}>
                › {p.label}
              </HudText>
              <HudText size={11} color={L.text}>
                +{p.xp}
              </HudText>
            </View>
          ))}
        </View>

        {r.titles.length ? (
          <View style={{ borderTopWidth: 1, borderTopColor: L.panelEdge, paddingTop: 10, gap: 4 }}>
            <HudText size={11} color={L.gold} weight="700">
              TITLE{r.titles.length > 1 ? 'S' : ''} ACQUIRED
            </HudText>
            {r.titles.map((t) => (
              <HudText key={t} size={14} color={L.text} weight="700">
                ◆ {t}
              </HudText>
            ))}
          </View>
        ) : null}
      </SystemPanel>
    </Animated.View>
  );
}
