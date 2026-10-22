import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { isoDate } from '@/core/dates';
import type { DB } from '@/db/types';

import { backupToJson, buildBackup, buildCsvFiles, parseBackup, restoreBackup } from './export';
import { MAX_BACKUP_BYTES } from './validate';

/**
 * Exports hold the user's full training and health history, so they are written to
 * a dedicated folder inside the app's private cache and removed again instead of
 * being left behind indefinitely.
 */
const EXPORT_DIR_NAME = 'exports';
/** How long an export stays around for the receiving app to read it. */
const EXPORT_TTL_MS = 10 * 60 * 1000;

function exportDir(): Directory {
  return new Directory(Paths.cache, EXPORT_DIR_NAME);
}

/** Delete old export files. Called on launch and before every new export. */
export function purgeExportCache(maxAgeMs = EXPORT_TTL_MS): void {
  try {
    const dir = exportDir();
    if (!dir.exists) return;
    const cutoff = Date.now() - maxAgeMs;
    for (const entry of dir.list()) {
      if (entry instanceof File) {
        const mtime = entry.modificationTime ?? 0;
        if (maxAgeMs <= 0 || mtime < cutoff) entry.delete();
      }
    }
  } catch {
    // Best effort: cleanup must never block the app.
  }
}

async function shareText(fileName: string, contents: string, mimeType: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  purgeExportCache();
  const dir = exportDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  try {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  } catch (e) {
    try {
      file.delete();
    } catch {
      // ignore
    }
    throw e;
  }
  // Not deleted immediately: on Android the receiving app may still be reading the
  // file after the share sheet closes. purgeExportCache removes it shortly after.
}

export async function shareBackup(db: DB) {
  await shareText(`ovrld-backup-${isoDate()}.json`, backupToJson(buildBackup(db)), 'application/json');
}

const CSV_EXPORTS = new Set(['workout_log.csv', 'bodyweights.csv']);

export async function shareCsv(db: DB, which: string = 'workout_log.csv') {
  if (!CSV_EXPORTS.has(which)) throw new Error(`Unknown export ${which}`);
  const contents = buildCsvFiles(db)[which];
  if (!contents) throw new Error(`Unknown export ${which}`);
  await shareText(`overload-${which.replace('.csv', '')}-${isoDate()}.csv`, contents, 'text/csv');
}

/** Lets the user pick a backup file; returns the parsed, validated backup (not yet applied). */
export async function pickBackup() {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return undefined;
  const asset = res.assets[0];
  const file = new File(asset.uri);
  try {
    const size = asset.size ?? file.size ?? 0;
    if (size > MAX_BACKUP_BYTES) throw new Error('This file is too large to be an OVRLD backup');
    const text = await file.text();
    return parseBackup(text);
  } finally {
    // The picker copied the file into our cache; don't keep a second copy of the data.
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  }
}

export { restoreBackup };
