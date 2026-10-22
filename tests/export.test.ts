import { describe, expect, it } from 'vitest';

import { backupToJson, buildBackup, buildCsvFiles, csvCell, parseBackup, restoreBackup } from '@/data/export';
import { logBodyweight } from '@/db/repositories/body';
import { startProgram } from '@/db/repositories/enrolments';
import { createCustomExercise } from '@/db/repositories/exercises';
import { createTestDb } from './helpers';

describe('backup and restore', () => {
  it('round-trips everything into a fresh database', async () => {
    const { db } = await createTestDb();
    logBodyweight(db, '2026-10-20', 95.4);
    startProgram(db, 'tpl_bodypart_5', '2026-10-20');
    createCustomExercise(db, { name: 'Belt Squat, "machine"', primaryMuscle: 'quads', equipment: 'machine', pattern: 'squat' });
    const json = backupToJson(buildBackup(db));

    const fresh = await createTestDb({ seed: false });
    const { rows } = restoreBackup(fresh.db, parseBackup(json));
    expect(rows).toBeGreaterThan(100);
    const again = buildBackup(fresh.db);
    const original = parseBackup(json);
    for (const name of Object.keys(original.tables) as (keyof typeof original.tables)[]) {
      expect(again.tables[name], name).toEqual(original.tables[name]);
    }
  });

  it('rejects files that are not backups and leaves data untouched on failure', async () => {
    const { db } = await createTestDb();
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"format":"x"}')).toThrow(/not an Overload backup/);
    const b = buildBackup(db);
    logBodyweight(db, '2026-10-20', 95);
    // Corrupt one row so the insert fails mid-restore
    (b.tables.bodyweights as any[]).push({ id: null, date: null, kg: null });
    expect(() => restoreBackup(db, b)).toThrow();
    const after = buildBackup(db);
    expect(after.tables.bodyweights).toHaveLength(1); // rolled back
  });
});

describe('CSV', () => {
  it('escapes cells correctly', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
  });

  it('produces a file per table plus a workout log', async () => {
    const { db } = await createTestDb();
    const files = buildCsvFiles(db);
    expect(Object.keys(files)).toContain('exercises.csv');
    expect(Object.keys(files)).toContain('workout_log.csv');
    expect(files['exercises.csv'].split('\r\n')[0]).toContain('primary_muscle');
  });
});
