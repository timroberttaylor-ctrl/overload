import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { EXERCISE_MEDIA } from '@/db/seed/exercise-media';
import { useTheme } from '@/hooks/use-theme';

import { EquipmentIcon } from './exercise-thumb';
import { Icon, Small } from './ui';

export function hasDemo(exerciseId: string) {
  return !!EXERCISE_MEDIA[exerciseId];
}

/**
 * Start/end position illustration that flips between the two frames so it reads
 * like a slow animation. Tap to pause. Falls back to an icon when no image exists.
 */
export function ExerciseDemo({ exerciseId, equipment, size = 'lg', onPress }: { exerciseId: string; equipment?: string; size?: 'lg' | 'sm'; onPress?: () => void }) {
  const t = useTheme();
  const media = EXERCISE_MEDIA[exerciseId];
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!media || paused) return;
    const id = setInterval(() => setFrame((f) => 1 - f), size === 'lg' ? 1100 : 1400);
    return () => clearInterval(id);
  }, [media, paused, size]);

  const box = size === 'lg' ? styles.lg : styles.sm;
  const content = media ? (
    <Image source={media.frames[frame]} resizeMode="contain" style={[box, { tintColor: t.text }]} accessibilityLabel="Exercise demonstration" />
  ) : (
    <EquipmentIcon equipment={equipment ?? 'other'} size={size === 'lg' ? 48 : 22} color={t.textSecondary} />
  );

  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={onPress ?? (() => setPaused((p) => !p))}
        accessibilityRole="button"
        accessibilityLabel={onPress ? 'Open exercise' : paused ? 'Play demonstration' : 'Pause demonstration'}
        style={[styles.frame, size === 'lg' ? styles.frameLg : styles.frameSm, { backgroundColor: t.backgroundSelected }]}>
        {content}
        {size === 'lg' && media ? (
          <View style={[styles.badge, { backgroundColor: t.background }]}>
            <Icon name={paused ? 'play' : 'pause'} size={12} color={t.textSecondary} />
          </View>
        ) : null}
      </Pressable>
      {size === 'lg' && media?.variant ? <Small>Illustration shows a close variation of this exercise.</Small> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frameLg: { borderRadius: 18, height: 230, padding: 14 },
  frameSm: { borderRadius: 10, width: 48, height: 48, padding: 4 },
  lg: { width: '100%', height: '100%' },
  sm: { width: 40, height: 40 },
  badge: { position: 'absolute', right: 10, bottom: 10, borderRadius: 12, padding: 6 },
});
