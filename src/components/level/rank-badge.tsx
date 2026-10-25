import { Text, View } from 'react-native';

import type { RankId } from '@/core/leveling';
import { Fonts } from '@/constants/theme';
import { LevelColors as L, RankColors } from '@/constants/level-theme';

/** Rank letter inside a glowing diamond. */
export function RankBadge({ rank, size = 56, dimmed }: { rank: RankId; size?: number; dimmed?: boolean }) {
  const c = dimmed ? L.locked : RankColors[rank];
  const inner = size * 0.72;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${rank} rank`}>
      <View
        style={{
          position: 'absolute',
          width: inner,
          height: inner,
          transform: [{ rotate: '45deg' }],
          borderWidth: 2,
          borderColor: c,
          backgroundColor: c + '1F',
          shadowColor: c,
          shadowOpacity: dimmed ? 0 : 0.8,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Text style={{ fontFamily: Fonts?.mono ?? 'monospace', fontSize: size * 0.42, fontWeight: '700', color: dimmed ? L.dim : c }}>{rank}</Text>
    </View>
  );
}
