import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

import { EXERCISE_MEDIA } from '@/db/seed/exercise-media';
import { useTheme } from '@/hooks/use-theme';

import { Icon } from './ui';

// Our own glyphs where the icon sets have nothing that reads as gym equipment.
const CABLE = require('../../assets/icons/equip_cable.png');
const MACHINE = require('../../assets/icons/equip_machine.png');

/** Icon for an equipment type: cable stack, weight-stack machine, barbell, dumbbell, bodyweight… */
export function EquipmentIcon({ equipment, size = 22, color }: { equipment: string; size?: number; color?: string }) {
  const t = useTheme();
  const c = color ?? t.accent;
  switch (equipment) {
    case 'cable':
      return <Image source={CABLE} style={{ width: size, height: size, tintColor: c }} accessibilityIgnoresInvertColors />;
    case 'machine':
      return <Image source={MACHINE} style={{ width: size, height: size, tintColor: c }} accessibilityIgnoresInvertColors />;
    case 'barbell':
      return <Icon name="barbell-outline" size={size} color={c} />;
    case 'dumbbell':
      return <MaterialCommunityIcons name="dumbbell" size={size} color={c} />;
    case 'kettlebell':
      return <MaterialCommunityIcons name="kettlebell" size={size} color={c} />;
    case 'bodyweight':
      return <MaterialCommunityIcons name="human-handsup" size={size} color={c} />;
    default:
      return <MaterialCommunityIcons name="weight" size={size} color={c} />;
  }
}

/**
 * List thumbnail for an exercise: the start-position illustration when we have one,
 * otherwise an icon for its equipment.
 */
export function ExerciseThumb({ exerciseId, equipment, size = 44 }: { exerciseId: string; equipment: string; size?: number }) {
  const t = useTheme();
  const media = EXERCISE_MEDIA[exerciseId];
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: Math.round(size * 0.24), backgroundColor: t.backgroundSelected }]}>
      {media ? (
        <Image source={media.frames[0]} resizeMode="contain" style={{ width: size - 6, height: size - 6, tintColor: t.accent }} accessibilityIgnoresInvertColors />
      ) : (
        <EquipmentIcon equipment={equipment} size={Math.round(size * 0.5)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
