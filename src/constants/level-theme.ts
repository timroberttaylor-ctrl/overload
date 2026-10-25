/**
 * Level Up mode palette: a glowing "system window" HUD look.
 * It lives only inside Level Up panels, so the rest of OVRLD keeps its own green theme.
 * The panels are always dark, in both app appearances, like a game overlay.
 */
import type { RankId } from '@/core/leveling';

export const LevelColors = {
  backdrop: '#05080F',
  panel: '#0A1222',
  panelEdge: '#13203A',
  frame: '#2F8CFF',
  glow: '#3FA2FF',
  glowSoft: '#3FA2FF33',
  text: '#E6F0FF',
  dim: '#7D93B5',
  xp: '#5CC8FF',
  xpTrack: '#16233D',
  gold: '#FFD166',
  goldSoft: '#FFD16626',
  locked: '#3A4A66',
} as const;

export const RankColors: Record<RankId, string> = {
  E: '#9AA4B2',
  D: '#4ADE80',
  C: '#38BDF8',
  B: '#A78BFA',
  A: '#F59E0B',
  S: '#F43F5E',
};
