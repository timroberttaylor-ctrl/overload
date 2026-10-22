import { describe, expect, it } from 'vitest';

import { cycleOrder } from '@/db/repositories/enrolments';
import { backupToJson, buildBackup, csvCell, parseBackup, restoreBackup, type Backup } from '@/data/export';
import { MAX_BACKUP_BYTES } from '@/data/validate';
import { isSafeWebUrl } from '@/core/safe-url';
import { parseMuscles } from '@/core/json';
import { createCustomExercise, getExercise, setExerciseMediaUrl } from '@/db/repositories/exercises';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '@/db/repositories/settings';
import { settings } from '@/db/schema';
import { seedDatabase } from '@/db/seed/seed';
import { createTestDb } from './helpers';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('media links', () => {
  it('only allows plain web links', () => {
    expect(isSafeWebUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isSafeWebUrl('http://example.com')).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'intent://scan/#Intent;scheme=zxing;package=com.evil;end',
      'file:///data/data/app.overload.training/databases/overload.db',
      'tel:+611900000000',
      'sms:+61400000000?body=hi',
      'content://com.android.contacts/contacts',
      'overload://session/abc',
      'https://',
      'https://youtube.com@evil.example/x',
      'https://exa mple.com',
      'https://example.com/\nfoo',
      'https:\\\\evil.example',
      'h'.repeat(10) + 'https://example.com',
      'https://' + 'a'.repeat(3000) + '.com',
      42,
      null,
    ]) {
      expect(isSafeWebUrl(bad), String(bad)).toBe(false);
    }
  });

  it('refuses to save unsafe links', async () => {
    const { db } = await createTestDb();
    const ex = createCustomExercise(db, { name: 'Belt squat', primaryMuscle: 'quads', equipment: 'machine', pattern: 'squat' });
    expect(() => setExerciseMediaUrl(db, ex.id, 'intent://x#Intent;end')).toThrow();
    setExerciseMediaUrl(db, ex.id, 'https://youtu.be/abc');
    expect(getExercise(db, ex.id)!.mediaUrl).toBe('https://youtu.be/abc');
  });
});

describe('backup validation', () => {
  async function goodBackup(): Promise<Backup> {
    const { db } = await createTestDb();
    return clone(buildBackup(db));
  }

  it('accepts a genuine backup', async () => {
    const b = await goodBackup();
    expect(() => parseBackup(backupToJson(b))).not.toThrow();
  });

  it('rejects a smuggled intent:// link', async () => {
    const b = await goodBackup();
    (b.tables.exercises[0] as Record<string, unknown>).mediaUrl = 'intent://evil#Intent;package=com.evil;end';
    expect(() => parseBackup(backupToJson(b))).toThrow(/invalid value/);
  });

  it('rejects malformed JSON columns that would crash screens', async () => {
    const b = await goodBackup();
    (b.tables.exercises[0] as Record<string, unknown>).secondaryMuscles = '{not json';
    expect(() => parseBackup(backupToJson(b))).toThrow(/secondaryMuscles/);
  });

  it('rejects settings that would brick launch, and unknown settings keys', async () => {
    const b = await goodBackup();
    b.tables.settings.push({ id: 'appearance', value: 'not-json' });
    expect(() => parseBackup(backupToJson(b))).toThrow();
    const b2 = await goodBackup();
    b2.tables.settings.push({ id: '../../evil', value: '1' });
    expect(() => parseBackup(backupToJson(b2))).toThrow(/unknown setting/);
  });

  it('rejects wrong types, unknown enum values, unexpected fields and duplicate ids', async () => {
    const cases: ((b: Backup) => void)[] = [
      (b) => ((b.tables.exercises[0] as Record<string, unknown>).isCompound = 'yes'),
      (b) => ((b.tables.exercises[0] as Record<string, unknown>).pattern = 'teleport'),
      (b) => ((b.tables.exercises[0] as Record<string, unknown>).__proto__x = 1),
      (b) => ((b.tables.exercises[0] as Record<string, unknown>).name = 'x'.repeat(50_000)),
      (b) => ((b.tables.exercises[0] as Record<string, unknown>).defaultIncrementKg = 'NaN'),
      (b) => b.tables.exercises.push(clone(b.tables.exercises[0])),
      (b) => b.tables.exercises.push('row' as never),
      (b) => ((b.tables as Record<string, unknown>).sessions = {}),
    ];
    for (const mutate of cases) {
      const b = await goodBackup();
      mutate(b);
      expect(() => parseBackup(backupToJson(b))).toThrow();
    }
  });

  it('rejects files that are too large before parsing them', () => {
    expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow(/too large/);
  });

  it('restoreBackup refuses unvalidated data and leaves the database untouched', async () => {
    const { db } = await createTestDb();
    const before = buildBackup(db);
    const b = clone(before);
    (b.tables.exercises[0] as Record<string, unknown>).mediaUrl = 'javascript:alert(1)';
    expect(() => restoreBackup(db, b)).toThrow();
    expect(buildBackup(db).tables.exercises).toEqual(before.tables.exercises);
  });
});

describe('robust reads of stored JSON', () => {
  it('getSettings falls back to defaults on bad stored values instead of throwing', async () => {
    const { db } = await createTestDb();
    db.insert(settings).values({ id: 'appearance', value: '{broken' }).onConflictDoUpdate({ target: settings.id, set: { value: '{broken' } }).run();
    db.insert(settings).values({ id: 'units', value: '"stone"' }).onConflictDoUpdate({ target: settings.id, set: { value: '"stone"' } }).run();
    const s = getSettings(db);
    expect(s.appearance).toBe(DEFAULT_SETTINGS.appearance);
    expect(s.units).toBe(DEFAULT_SETTINGS.units);
    expect(() => updateSettings(db, { units: 'stone' as never })).toThrow();
  });

  it('seeding survives a corrupt seed marker', async () => {
    const { db } = await createTestDb();
    db.update(settings).set({ value: '{broken' }).run();
    expect(() => seedDatabase(db)).not.toThrow();
  });

  it('day order and muscles parse safely', () => {
    expect(cycleOrder({ dayOrder: '{bad' }, 3)).toEqual([0, 1, 2]);
    expect(parseMuscles('nope')).toEqual([]);
    expect(parseMuscles('["glutes"]')).toEqual(['glutes']);
  });
});

describe('CSV formula injection', () => {
  it('neutralises cells that spreadsheets would run as formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(102.5)).toBe('102.5');
  });
});
