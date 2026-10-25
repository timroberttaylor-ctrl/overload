/**
 * Workout-player flow: which set comes next and what kind of rest follows a logged set.
 *
 * Supersets / giant sets (exercises sharing a `series`) are done in rounds: one set of
 * each exercise back to back, then the full rest. Plain exercises are done set by set.
 */

export type FlowSet = { id: string; completed: boolean; setType: string };
export type FlowGroup = { series: string | null; sets: FlowSet[] };
export type NextSet = { groupIndex: number; setId: string };

const working = (g: FlowGroup) => g.sets.filter((s) => s.completed && s.setType !== 'warmup').length;
const blockKey = (g: FlowGroup, i: number) => (g.series ? `s:${g.series}` : `i:${i}`);

/**
 * The set to do next. Blocks (a superset, or a single exercise) run in screen order.
 * Inside a superset the exercise with the fewest working sets logged goes next (ties go
 * to the earlier one), so A1 → A2 → A1 → A2…, warm-ups first, and uneven set counts and
 * out-of-order logging still work out.
 */
export function nextSet(groups: FlowGroup[]): NextSet | null {
  const seen = new Set<string>();
  for (let i = 0; i < groups.length; i++) {
    const key = blockKey(groups[i], i);
    if (seen.has(key)) continue;
    seen.add(key);
    let best: { i: number; done: number } | null = null;
    groups.forEach((g, j) => {
      if (blockKey(g, j) !== key || !g.sets.some((s) => !s.completed)) return;
      const done = working(g);
      if (!best || done < best.done) best = { i: j, done };
    });
    if (best) {
      const gi = (best as { i: number }).i;
      return { groupIndex: gi, setId: groups[gi].sets.find((s) => !s.completed)!.id };
    }
  }
  return null;
}

/** Marks one set done (pure), for working out what follows it. */
export function withLogged(groups: FlowGroup[], setId: string): FlowGroup[] {
  return groups.map((g) => ({ ...g, sets: g.sets.map((s) => (s.id === setId ? { ...s, completed: true } : s)) }));
}

/**
 * After logging a set in `groupIndex`: a short changeover when the next set is a later
 * exercise in the same superset round, otherwise the full rest.
 */
export function restKindAfter(groupsAfterLog: FlowGroup[], groupIndex: number): 'changeover' | 'rest' {
  const g = groupsAfterLog[groupIndex];
  const next = nextSet(groupsAfterLog);
  if (!g?.series || !next) return 'rest';
  const ng = groupsAfterLog[next.groupIndex];
  return ng.series === g.series && next.groupIndex > groupIndex ? 'changeover' : 'rest';
}
