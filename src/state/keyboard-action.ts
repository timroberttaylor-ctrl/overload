import { create } from 'zustand';

/**
 * The primary action on the iOS number-pad bar ("Next", "Log set"). The focused field sets it,
 * so the shared bar above the keyboard always does the right thing for that field.
 */
export type KeyboardAction = { owner: string; label: string; run: () => void };

export const useKeyboardAction = create<{
  action: KeyboardAction | null;
  setAction: (a: KeyboardAction) => void;
  clearAction: (owner: string) => void;
}>((set) => ({
  action: null,
  setAction: (action) => set({ action }),
  // Only clear if this field still owns it (focus may already have moved to the next field).
  clearAction: (owner) => set((s) => (s.action?.owner === owner ? { action: null } : s)),
}));
