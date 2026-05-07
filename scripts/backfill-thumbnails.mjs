#!/usr/bin/env node
// Backfill 400px JPEG thumbnails for every image row in a team's media DB.
// Idempotent: skips rows whose thumbnail already exists. Logs failures and
// continues. Safe to re-run.
//
// Usage:
//   node scripts/backfill-thumbnails.mjs --team hmx-marketing-team
//   node scripts/backfill-thumbnails.mjs --team hmx-marketing-team --force
//
// --force regenerates even if a thumb is already cached.

import { existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';

const pExecFile = promisify(execFile);

const args = process.argv.slice(2);
const team = (() => {
  const i = args.indexOf('--team');
  if (i < 0 || !args[i + 1]) {
    console.error('error: --team <id> is required');
    process.exit(1);
  }
  return args[i + 1];
})();
const force = args.includes('--force');

const DB_PATH = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', `marketing-${team}.db`);
const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media', team);
const THUMB_DIR = join(MEDIA_DIR, 'thumbs');
const THUMB_MAX_DIM = 400;
const THUMB_QUALITY = 80;

if (!existsSync(DB_PATH)) {
  console.error(`error: db not found at ${DB_PATH}`);
  process.exit(1);
}
if (!existsSync(MEDIA_DIR)) {
  console.error(`error: media dir not found at ${MEDIA_DIR}`);
  process.exit(1);
}
if (!existsSync(THUMB_DIR)) mkdirSync(THUMB_DIR, { recursive: true });

const db = new Database(DB_PATH, { readonly: true });
const rows = db.prepare("SELECT id, filename, mime_type FROM media WHERE mime_type LIKE 'image/%' AND team_id = ? ORDER BY created_at DESC").all(team);
db.close();

console.log(`team:        ${team}`);
console.log(`media dir:   ${MEDIA_DIR}`);
console.log(`thumb dir:   ${THUMB_DIR}`);
console.log(`force:       ${force}`);
console.log(`image rows:  ${rows.length}\n`);

let ok = 0, skip = 0, fail = 0;
const start = Date.now();
const failures = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const src = join(MEDIA_DIR, row.filename);
  const dest = join(THUMB_DIR, `${row.id}.jpg`);
  const idShort = row.id.slice(0, 8);

  if (!force && existsSync(dest)) {
    skip++;
    if ((skip + ok + fail) % 50 === 0) console.log(`  [${i + 1}/${rows.length}] skip-cached: ${idShort}`);
    continue;
  }
  if (!existsSync(src)) {
    fail++;
    failures.push({ id: row.id, reason: 'source missing on disk', src });
    console.log(`  [${i + 1}/${rows.length}] FAIL ${idShort}: source missing`);
    continue;
  }

  try {
    if (force && existsSync(dest)) unlinkSync(dest);
    await pExecFile('sips', [
      '-Z', String(THUMB_MAX_DIM),
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(THUMB_QUALITY),
      src,
      '--out', dest,
    ]);
    const sz = statSync(dest).size;
    ok++;
    if ((ok + skip + fail) % 25 === 0) {
      console.log(`  [${i + 1}/${rows.length}] ok ${idShort}  (${(sz / 1024).toFixed(0)}KB)`);
    }
  } catch (err) {
    fail++;
    failures.push({ id: row.id, reason: err?.message || String(err), src });
    console.log(`  [${i + 1}/${rows.length}] FAIL ${idShort}: ${err?.message || err}`);
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\ndone in ${elapsed}s — ${ok} generated, ${skip} skipped (already cached), ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f.id.slice(0, 8)}  ${f.reason}  (${f.src})`);
}
process.exit(fail ? 1 : 0);
