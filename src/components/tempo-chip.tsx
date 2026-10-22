import { Alert, Pressable, Text } from 'react-native';

import { describeTempo, parseTempo, secondsPerRep } from '@/core/tempo';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './ui';

/** "⏱ 3/1/X/1" chip; tap for a plain-language explanation. */
export function TempoChip({ tempo }: { tempo: string | null | undefined }) {
  const t = useTheme();
  const parsed = parseTempo(tempo);
  if (!parsed || !tempo) return null;
  const explain = () =>
    Alert.alert(
      `Tempo ${tempo}`,
      `${describeTempo(parsed)}.\n\nAbout ${secondsPerRep(parsed)} s per rep. The four numbers are: lowering · pause at the bottom · lifting · pause at the top. X means lift as fast as you can with control.`,
    );
  return (
    <Pressable
      onPress={explain}
      accessibilityRole="button"
      accessibilityLabel={`Tempo ${tempo}. ${describeTempo(parsed)}`}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9, backgroundColor: t.accentDim }}>
      <Icon name="timer-outline" size={13} color={t.accent} />
      <Text style={{ color: t.accent, fontWeight: '800', fontSize: 12, fontVariant: ['tabular-nums'] }}>{tempo}</Text>
    </Pressable>
  );
}
