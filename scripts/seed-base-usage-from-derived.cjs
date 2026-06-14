#!/usr/bin/env node
/**
 * Seed base_photo_usage from the historical derivation record.
 *
 * Every AI-generated media item carries a `source-media:<uuid>` tag pointing at
 * the image it was edited from. Walking that chain back to its root human base
 * photo tells us which bases we've ALREADY generated from. We record one usage
 * row per derived image (mark-at-selection semantics, applied retroactively) so
 * the rotation deprioritizes already-used bases and serves the never-touched
 * ones first.
 *
 * Idempotent: clears prior rows tagged run_context='backfill:derived-from'
 * before re-inserting, so it can be re-run safely.
 *
 * Usage:
 *   node seed-base-usage-from-derived.cjs --team hmx-marketing-team [--apply]
 *   (defaults to DRY RUN; pass --apply to write)
 */
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def;
}
const team = arg('team', 'hmx-marketing-team');
const apply = process.argv.includes('--apply');
const RUN_CONTEXT = 'backfill:derived-from';

const dbPath = path.join(os.homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', `marketing-${team}.db`);
const db = new Database(dbPath);

const all = db.prepare('SELECT id, tags, original_name, created_at FROM media').all();
const byId = new Map(all.map((m) => [m.id, m]));

function tagsOf(m) { try { return JSON.parse(m.tags || '[]'); } catch { return []; } }
function isHumanBase(m) {
  const t = tagsOf(m);
  return t.includes('human') && !t.includes('ai-generated');
}
function sourceIdOf(m) {
  const tag = tagsOf(m).find((t) => t.startsWith('source-media:'));
  return tag ? tag.slice('source-media:'.length) : null;
}

// Walk source-media chain until we hit a human base (or dead-end). Guards cycles.
function resolveRootHumanBase(m) {
  const seen = new Set();
  let cur = m;
  for (let hops = 0; hops < 10 && cur; hops++) {
    const srcId = sourceIdOf(cur);
    if (!srcId || seen.has(srcId)) return null;
    seen.add(srcId);
    const src = byId.get(srcId);
    if (!src) return null;            // source deleted/missing
    if (isHumanBase(src)) return src; // found the base
    cur = src;                         // keep walking the chain
  }
  return null;
}

const derived = all.filter((m) => sourceIdOf(m));
const inserts = [];
let skippedMissing = 0;
for (const d of derived) {
  const base = resolveRootHumanBase(d);
  if (!base) { skippedMissing++; continue; }
  inserts.push({ mediaId: base.id, usedAt: d.created_at || new Date().toISOString(), name: base.original_name });
}

// Summary
const perBase = new Map();
for (const i of inserts) perBase.set(i.mediaId, (perBase.get(i.mediaId) || 0) + 1);
console.log(`Derived images: ${derived.length}`);
console.log(`Resolved to a human base: ${inserts.length}`);
console.log(`Skipped (no resolvable human-base source): ${skippedMissing}`);
console.log(`Distinct human bases marked: ${perBase.size}`);
const top = [...perBase.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log('Top marked bases (usage_count):');
for (const [id, n] of top) console.log(`  ${n}  ${byId.get(id)?.original_name || id}`);

if (!apply) {
  console.log('\nDRY RUN — no rows written. Re-run with --apply to write.');
  process.exit(0);
}

const tx = db.transaction(() => {
  const del = db.prepare('DELETE FROM base_photo_usage WHERE team_id = ? AND run_context = ?');
  del.run(team, RUN_CONTEXT);
  const ins = db.prepare('INSERT INTO base_photo_usage (id, team_id, media_id, used_at, run_context) VALUES (?, ?, ?, ?, ?)');
  for (const i of inserts) ins.run(crypto.randomUUID(), team, i.mediaId, i.usedAt, RUN_CONTEXT);
});
tx();
const total = db.prepare('SELECT COUNT(*) AS c FROM base_photo_usage WHERE team_id = ?').get(team).c;
console.log(`\nAPPLIED. Inserted ${inserts.length} rows. base_photo_usage total for ${team}: ${total}.`);
