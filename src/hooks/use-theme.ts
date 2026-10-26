import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAppearance } from '@/state/appearance';

/** True when Level Up mode is on: the app uses the HUD theme throughout. */
export function useHud(): boolean {
  return useAppearance((s) => s.levelMode);
}

export function useSchemeName(): 'dark' | 'light' {
  const system = useColorScheme();
  const appearance = useAppearance((s) => s.appearance);
  const hud = useHud();
  // The HUD is always dark, so colour codes use their dark-mode variants.
  if (hud) return 'dark';
  if (appearance === 'system') return system === 'light' ? 'light' : 'dark';
  return appearance;
}

export function useTheme() {
  const scheme = useSchemeName();
  const hud = useHud();
  return hud ? Colors.hud : Colors[scheme];
}
