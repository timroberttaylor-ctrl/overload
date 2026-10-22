import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAppearance } from '@/state/appearance';

export function useSchemeName(): 'dark' | 'light' {
  const system = useColorScheme();
  const appearance = useAppearance((s) => s.appearance);
  if (appearance === 'system') return system === 'light' ? 'light' : 'dark';
  return appearance;
}

export function useTheme() {
  return Colors[useSchemeName()];
}
