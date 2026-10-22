import { describe, expect, it } from 'vitest';

import { runMigrations } from '@/db/migrate';
import { SEED_EXERCISES } from '@/db/seed/exercises';
import { SEED_PROGRAMS } from '@/db/seed/programs';
import { seedDatabase } from '@/db/seed/seed';
import { createTestDb } from './helpers';

describe('migrations', () => {
  it('creates every table and is safe to re-run', async () => {
    const { db, raw } = await createTestDb({ seed: false });
    const tables = raw.prepare("select name from sqlite_master where type='table'").all().map((r: any) => r.name);
    for (const t of ['exercises', 'program_templates', 'sessions', 'set_logs', 'health_daily', 'change_log', 'settings']) {
      expect(tables).toContain(t);
    }
    await runMigrations(db); // second run is a no-op
    const triggers = raw.prepare("select count(*) n from sqlite_master where type='trigger'").get() as { n: number };
    expect(triggers.n).toBe(17 * 4);
  });

  it('records inserts, updates and deletes in the change log exactly once each', async () => {
    const { raw } = await createTestDb({ seed: false });
    raw.prepare("insert into bodyweights (id, date, kg, source) values ('2026-10-01','2026-10-01',95,'manual')").run();
    raw.prepare("update bodyweights set kg = 94.5 where id = '2026-10-01'").run();
    raw.prepare("update bodyweights set deleted_at = 1, updated_at = updated_at + 1 where id = '2026-10-01'").run();
    raw.prepare("delete from bodyweights where id = '2026-10-01'").run();
    const ops = raw.prepare("select op from change_log where table_name='bodyweights' order by seq").all().map((r: any) => r.op);
    expect(ops).toEqual(['insert', 'update', 'delete', 'delete']);
  });

  it('bumps updated_at automatically when a write forgets to', async () => {
    const { raw } = await createTestDb({ seed: false });
    raw.prepare("insert into settings (id, value, updated_at) values ('x','1', 1)").run();
    raw.prepare("update settings set value = '2' where id = 'x'").run();
    const row = raw.prepare("select updated_at from settings where id='x'").get() as { updated_at: number };
    expect(row.updated_at).toBeGreaterThan(1);
  });
});

describe('seed', () => {
  it('loads the library and four templates, idempotently', async () => {
    const { db, raw } = await createTestDb();
    const count = (t: string) => (raw.prepare(`select count(*) n from ${t}`).get() as { n: number }).n;
    expect(count('exercises')).toBe(SEED_EXERCISES.length);
    expect(count('program_templates')).toBe(4);
    const before = count('program_exercises');
    expect(seedDatabase(db).seeded).toBe(false); // already at current version
    seedDatabase(db, { force: true });
    expect(count('program_exercises')).toBe(before);
    expect(count('exercises')).toBe(SEED_EXERCISES.length);
  });

  it('has unique exercise ids and every program slot references a real exercise', () => {
    const ids = new Set(SEED_EXERCISES.map((e) => e.id));
    expect(ids.size).toBe(SEED_EXERCISES.length);
    for (const p of SEED_PROGRAMS) {
      for (const d of p.days) for (const s of d.slots) expect(ids, `${p.id}/${d.name}/${s.exerciseId}`).toContain(s.exerciseId);
    }
  });

  it('templates are internally consistent', () => {
    for (const p of SEED_PROGRAMS) {
      expect(p.days.length, p.id).toBe(7);
      // phases cover every week exactly once
      const covered = Array(p.weeks).fill(0);
      for (const ph of p.phases) for (let w = ph.weekFrom; w <= ph.weekTo; w++) covered[w - 1]++;
      expect(covered.every((c) => c === 1), p.id).toBe(true);
      for (const d of p.days) {
        expect(!!d.rest === (d.slots.length === 0), `${p.id}/${d.name}`).toBe(true);
        for (const s of d.slots) {
          expect(s.repMin).toBeLessThanOrEqual(s.repMax);
          expect(s.sets).toBeGreaterThan(0);
        }
      }
    }
  });
});

import { normaliseTempo } from '@/core/tempo';

describe('seeded tempo', () => {
  it('every loaded prescription has a valid E/P/C/T tempo; tracked-only work has none', async () => {
    const { raw } = await createTestDb();
    const rows = raw.prepare('select pe.tempo, pe.rule, e.pattern from program_exercises pe join exercises e on e.id = pe.exercise_id').all() as { tempo: string | null; rule: string; pattern: string }[];
    for (const r of rows) {
      if (r.rule === 'none' || r.pattern === 'carry') expect(r.tempo).toBeNull();
      else if (r.tempo) expect(normaliseTempo(r.tempo)).toBe(r.tempo);
    }
    const withTempo = rows.filter((r) => r.tempo).length;
    expect(withTempo / rows.length).toBeGreaterThan(0.85);
    const bench = raw.prepare("select tempo from program_exercises where id = 'tpl_upper_lower_4:d0:0'").get() as { tempo: string };
    expect(bench.tempo).toBe('2/1/X/0');
  });
});
