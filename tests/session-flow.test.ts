import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { easedWeight } from '@/core/overload';
import { nextSet, restKindAfter, withLogged, type FlowGroup } from '@/core/session-flow';
import { setLogs } from '@/db/schema';
import { startProgram } from '@/db/repositories/enrolments';
import { easeRemainingSets, getSessionDetail, logSet, startProgramSession } from '@/db/repositories/sessions';
import { createTestDb } from './helpers';

const sets = (prefix: string, n: number, warm = 0) =>
  Array.from({ length: warm + n }, (_, i) => ({ id: `${prefix}${i < warm ? 'w' : ''}${i < warm ? i + 1 : i - warm + 1}`, completed: false, setType: i < warm ? 'warmup' : 'working' }));

/** Walks the whole workout the way the player would, returning set ids and the rest after each. */
function walk(groups: FlowGroup[]) {
  const out: string[] = [];
  let g = groups;
  for (let n = 0; n < 50; n++) {
    const next = nextSet(g);
    if (!next) break;
    g = withLogged(g, next.setId);
    out.push(`${next.setId}:${restKindAfter(g, next.groupIndex) === 'changeover' ? 'next' : 'rest'}`);
  }
  return out;
}

describe('superset flow', () => {
  it('alternates A1 → A2 each round with a changeover between them and rest after the round', () => {
    const groups: FlowGroup[] = [
      { series: 'A', sets: sets('a1-', 3) },
      { series: 'A', sets: sets('a2-', 3) },
      { series: null, sets: sets('c-', 2) },
    ];
    expect(walk(groups)).toEqual(['a1-1:next', 'a2-1:rest', 'a1-2:next', 'a2-2:rest', 'a1-3:next', 'a2-3:rest', 'c-1:rest', 'c-2:rest']);
  });

  it('does warm-ups first, copes with uneven set counts and giant sets', () => {
    const groups: FlowGroup[] = [
      { series: 'B', sets: sets('x-', 3, 1) },
      { series: 'B', sets: sets('y-', 2) },
      { series: 'B', sets: sets('z-', 2) },
    ];
    expect(walk(groups)).toEqual(['x-w1:rest', 'x-1:next', 'y-1:next', 'z-1:rest', 'x-2:next', 'y-2:next', 'z-2:rest', 'x-3:rest']);
  });

  it('goes back to the exercise that is behind when sets are logged out of order', () => {
    const groups: FlowGroup[] = [
      { series: 'A', sets: [{ id: 'a1-1', completed: true, setType: 'working' }, { id: 'a1-2', completed: true, setType: 'working' }, { id: 'a1-3', completed: false, setType: 'working' }] },
      { series: 'A', sets: sets('a2-', 3) },
    ];
    expect(nextSet(groups)).toEqual({ groupIndex: 1, setId: 'a2-1' });
  });

  it('plain exercises still run set by set', () => {
    const groups: FlowGroup[] = [{ series: null, sets: sets('p-', 2) }, { series: null, sets: sets('q-', 1) }];
    expect(walk(groups)).toEqual(['p-1:rest', 'p-2:rest', 'q-1:rest']);
  });
});

describe('in-session load drop when RPE runs over target', () => {
  it('keeps the weight within 1 RPE of target', () => {
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: 9, targetRpe: 8.5, stepKg: 2.5 })).toBeNull();
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: 8, targetRpe: 8.5, stepKg: 2.5 })).toBeNull();
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: null, targetRpe: 8.5, stepKg: 2.5 })).toBeNull();
    // Sets taken to failure on purpose are never eased
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: 10, targetRpe: 10, stepKg: 2.5 })).toBeNull();
  });

  it('drops to the load that brings the next set back to target, capped at 10 %', () => {
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: 10, targetRpe: 8.5, stepKg: 2.5 })).toBe(95);
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: 9.5, targetRpe: 8.5, stepKg: 2.5 })).toBe(97.5);
    expect(easedWeight({ weightKg: 100, reps: 8, rpe: 10, targetRpe: 5, stepKg: 2.5 })).toBe(90);
    // Light dumbbell: one step is more than 10 %, still allowed
    expect(easedWeight({ weightKg: 10, reps: 12, rpe: 10, targetRpe: 8, stepKg: 2 })).toBe(8);
  });

  it('lightens only the unlogged sets still at the weight just used', async () => {
    const { db } = await createTestDb();
    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-20');
    const s = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-20' });
    const working = getSessionDetail(db, s.id)!.groups[0].sets.filter((x) => x.setType === 'working');
    for (const w of working) db.update(setLogs).set({ targetRpe: 8.5, weightKg: 100 }).where(eq(setLogs.id, w.id)).run();
    // You already changed the last set yourself: leave it alone.
    db.update(setLogs).set({ weightKg: 102.5 }).where(eq(setLogs.id, working[2].id)).run();

    logSet(db, working[0].id, { weightKg: 100, reps: 8, rpe: 9 });
    expect(easeRemainingSets(db, working[0].id)).toBeNull();

    logSet(db, working[0].id, { weightKg: 100, reps: 8, rpe: 10 });
    expect(easeRemainingSets(db, working[0].id)).toEqual({ fromKg: 100, toKg: 95, count: 1, rpe: 10, targetRpe: 8.5 });
    const after = getSessionDetail(db, s.id)!.groups[0].sets.filter((x) => x.setType === 'working');
    expect(after.map((x) => x.weightKg)).toEqual([100, 95, 102.5]);
  });
});
