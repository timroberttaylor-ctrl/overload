import { create } from 'zustand';

export type Appearance = 'dark' | 'light' | 'system';

/**
 * In-memory mirror of the appearance settings so every component can theme without a DB read.
 * `levelMode` swaps the whole app to the Level Up HUD theme.
 */
export const useAppearance = create<{ appearance: Appearance; levelMode: boolean; setAppearance: (a: Appearance) => void; setLevelMode: (on: boolean) => void }>((set) => ({
  appearance: 'dark',
  levelMode: false,
  setAppearance: (appearance) => set({ appearance }),
  setLevelMode: (levelMode) => set({ levelMode }),
}));
