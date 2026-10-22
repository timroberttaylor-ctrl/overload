import { create } from 'zustand';

export type Appearance = 'dark' | 'light' | 'system';

/** In-memory mirror of the appearance setting so every component can theme without a DB read. */
export const useAppearance = create<{ appearance: Appearance; setAppearance: (a: Appearance) => void }>((set) => ({
  appearance: 'dark',
  setAppearance: (appearance) => set({ appearance }),
}));
