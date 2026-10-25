import { describe, expect, it } from 'vitest';

import { buildLevelProfile, questReward, levelForXp, rankForLevel, xpForLevel, xpToNext, XP, type LevelSession } from '@/core/leveling';
import { addDays } from '@/core/dates';
import { startProgram } from '@/db/repositories/enrolments';
import { getLevelProfile, sessionXp } from '@/db/repositories/leveling';
import { discardSession, finishSession, getSessionDetail, logSet, startProgramSession } from '@/db/repositories/sessions';
import { getSettings, updateSettings } from '@/db/repositories/settings';
import { createTestDb } from './helpers';

const squat = (weightKg: number, reps = 5) => ({ exerciseId: 'squat', weightKg, reps, isCompound: true });
const curl = (weightKg: number, reps = 12) => ({ exerciseId: 'curl', weightKg, reps, isCompound: false });

function session(id: string, date: string, sets: LevelSession['sets'], status: LevelSession['status'] = 'completed'): LevelSession {
  return { id, name: `Day ${id}`, date, startedAt: new Date(`${date}T07:00:00`).getTime(), status, sets };
}

describe('level curve', () => {
  it('needs more XP for each level and round-trips', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(xpToNext(1));
    expect(xpForLevel(3)).toBe(xpToNext(1) + xpToNext(2));
    for (const l of [1, 2, 9, 10, 35, 70]) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      expect(levelForXp(xpForLevel(l) - 1)).toBe(Math.max(1, l - 1));
    }
  });

  it('ranks run E to S', () => {
    expect([1, 9, 10, 20, 35, 50, 70, 99].map((l) => rankForLevel(l).id)).toEqual(['E', 'E', 'D', 'C', 'B', 'A', 'S', 'S']);
  });

  it('a year of 5 workouts a week lands around B-rank, not S', () => {
    const list: LevelSession[] = [];
    let d = '2025-10-06'; // a Monday
    for (let w = 0; w < 52; w++) {
      for (const off of [0, 1, 3, 4, 5]) {
        const date = addDays(d, off);
        list.push(session(`${w}-${off}`, date, [...Array(4)].map(() => squat(100)).concat([...Array(14)].map(() => curl(15)))));
      }
      d = addDays(d, 7);
    }
    const p = buildLevelProfile(list, '2026-10-04');
    expect(p.level).toBeGreaterThanOrEqual(35);
    expect(p.level).toBeLessThan(55);
    expect(p.rank.id).toBe('B');
  });
});

describe('XP for a workout', () => {
  it('awards completion, sets, tonnage, records and the weekly quest', () => {
    const p = buildLevelProfile(
      [
        session('a', '2026-10-19', [squat(100), squat(100), squat(100)]),
        session('b', '2026-10-21', [squat(105), squat(105), squat(105)], 'partial'),
        session('c', '2026-10-23', [squat(80, 3)]),
      ],
      '2026-10-25',
    );
    const [c, b, a] = p.log;
    // 100 + 3×8 + 1 t (1,500 kg) ×10; first session can't set a record
    expect(a.xp).toBe(XP.completed + 3 * XP.perSet + XP.perTonne);
    // partial 60 + 24 + 10 + one record
    expect(b.xp).toBe(XP.partial + 3 * XP.perSet + XP.perTonne + XP.pr);
    expect(b.parts.map((x) => x.label)).toContain('1 personal record');
    // third workout this week clears the weekly quest; 240 kg is under a tonne
    expect(c.xp).toBe(XP.completed + XP.perSet + XP.weekClear);
    expect(p.prs).toBe(1);
    expect(p.totalXp).toBe(a.xp + b.xp + c.xp);
    expect(p.log.map((l) => l.sessionId)).toEqual(['c', 'b', 'a']);
  });

  it('caps tonnage and record XP so one marathon session cannot farm levels', () => {
    const many = [...Array(60)].map((_, i) => ({ exerciseId: `ex${i}`, weightKg: 200, reps: 10, isCompound: true }));
    const first = many.map((s) => ({ ...s, weightKg: 100 }));
    const p = buildLevelProfile([session('a', '2026-10-19', first), session('b', '2026-10-20', many)], '2026-10-25');
    const b = p.log[0];
    expect(b.parts.find((x) => x.label.endsWith('t moved'))!.xp).toBe(XP.tonneCap);
    expect(b.parts.find((x) => x.label.includes('personal record'))!.xp).toBe(XP.prCap * XP.pr);
  });

  it('flags level-ups and unlocked titles on the workout that earned them', () => {
    // A normal first workout (15 working sets) is enough for level 2.
    const p = buildLevelProfile([session('a', '2026-10-19', [...Array(15)].map(() => squat(100)))], '2026-10-19');
    expect(p.log[0]).toMatchObject({ levelBefore: 1, levelAfter: 2, titles: ['Initiate'] });
    expect(p.activeTitle).toBe('Initiate');
  });
});

describe('streaks and stats', () => {
  it('counts weeks with 2+ workouts; a missed week breaks the streak but costs nothing', () => {
    const weeks = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
    const list = weeks.flatMap((w, i) => (i === 1 ? [session(`${i}a`, w, [squat(60)])] : [session(`${i}a`, w, [squat(60)]), session(`${i}b`, addDays(w, 2), [squat(60)])]));
    const p = buildLevelProfile(list, '2026-10-25');
    expect(p.weekStreak).toBe(2);
    expect(p.bestWeekStreak).toBe(2);
    expect(p.log.every((l) => l.xp > 0)).toBe(true);
  });

  it('builds stats from the log', () => {
    const p = buildLevelProfile([session('a', '2026-10-19', [squat(100, 5), squat(100, 5), curl(10, 300)])], '2026-10-19');
    const stat = Object.fromEntries(p.stats.map((s) => [s.key, s.value]));
    expect(stat).toEqual({ STR: 10, END: 11, DIS: 11, CON: 10 });
  });

  it('tracks the weekly quest and estimates the next workout reward', () => {
    const p = buildLevelProfile([session('a', '2026-10-19', [squat(60)]), session('b', '2026-10-21', [squat(60)]), session('c', '2026-10-14', [squat(60)])], '2026-10-23');
    expect(p.weekSessions).toBe(2);
    expect(questReward(10, p.weekSessions)).toBe(XP.completed + 10 * XP.perSet + XP.weekClear);
    expect(questReward(10, 0)).toBe(XP.completed + 10 * XP.perSet);
  });

  it('an empty log is level 1 E-rank with nothing unlocked', () => {
    const p = buildLevelProfile([], '2026-10-25');
    expect(p).toMatchObject({ level: 1, totalXp: 0, sessions: 0, activeTitle: null, weekStreak: 0 });
    expect(p.rank.id).toBe('E');
    expect(p.titles.every((t) => !t.unlocked)).toBe(true);
  });
});

describe('Level Up mode against the database', () => {
  it('is off by default and derives XP from finished workouts only', async () => {
    const { db } = await createTestDb();
    expect(getSettings(db).levelMode).toBe(false);
    expect(updateSettings(db, { levelMode: true }).levelMode).toBe(true);

    const e = startProgram(db, 'tpl_upper_lower_4', '2026-10-19');
    const s1 = startProgramSession(db, { enrolmentId: e.id, programDay: 0, date: '2026-10-19', now: new Date(2026, 9, 19, 7).getTime() });
    for (const s of getSessionDetail(db, s1.id)!.groups[0].sets) if (s.setType !== 'warmup') logSet(db, s.id, { weightKg: 80, reps: 5 });
    finishSession(db, s1.id);

    // An unfinished and a discarded workout earn nothing.
    const s2 = startProgramSession(db, { enrolmentId: e.id, programDay: 1, date: '2026-10-20', now: new Date(2026, 9, 20, 7).getTime() });
    for (const s of getSessionDetail(db, s2.id)!.groups[0].sets) logSet(db, s.id, { weightKg: 100, reps: 5 });
    expect(getLevelProfile(db, '2026-10-20').sessions).toBe(1);
    discardSession(db, s2.id);

    const p = getLevelProfile(db, '2026-10-20');
    expect(p.sessions).toBe(1);
    expect(p.totalXp).toBeGreaterThan(XP.partial);
    expect(sessionXp(db, s1.id)).toMatchObject({ sessionId: s1.id, levelBefore: 1 });
    expect(sessionXp(db, s2.id)).toBeUndefined();
  });
});
