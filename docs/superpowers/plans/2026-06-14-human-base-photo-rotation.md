# Human Base-Photo Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the weekly content workflow deterministically rotate through human-tagged base photos — never-used first, random within the freshest tier, auto-restarting the cycle when all are used — backed by a persistent usage ledger.

**Architecture:** A new `base_photo_usage` table in the marketing plugin DB is the running list. A pure selector module (`base-photo-rotation.ts`) runs raw SQL on the better-sqlite3 handle to pick the next N photos (`ORDER BY usage_count ASC, random()`) and record them in one transaction (mark-at-selection). Two handler routes expose it. A dashboard exec script calls it from a new `tool` node in the weekly workflow and writes the picks to a stable file the draft LLM reads via `{{file:...}}`.

**Tech Stack:** TypeScript, better-sqlite3 + drizzle-orm, vitest (in-memory DB), OpenClaw workflow JSON, Node ESM script.

---

## File Structure

**`kitchen-plugin-marketing`:**
- Create `src/api/base-photo-rotation.ts` — pure `selectNextBasePhotos()` + `getRotationStatus()` (raw SQL on a better-sqlite3 handle; no I/O beyond the DB).
- Create `src/api/base-photo-rotation.test.ts` — vitest against an in-memory better-sqlite3.
- Create `db/migrations/0005_base_photo_usage.sql` — the table + index (idempotent).
- Modify `src/db/schema.ts` — add `basePhotoUsage` drizzle table (typing/source-of-truth parity).
- Modify `src/db/index.ts` — add `0005_base_photo_usage.sql` to the fallback `migrationFiles` array (this project applies post-0001 migrations via that fallback).
- Modify `src/api/handler.ts` — add `POST /media/base-rotation/next` and `GET /media/base-rotation/status`.

**`hmx-dashboard`:**
- Create `scripts/select-base-photos.mjs` — calls the selector in-process, writes the picks file, fails loudly on empty pool.

**workspace (`~/.openclaw/workspace-hmx-marketing-team/shared-context`):**
- Modify `workflows/weekly-content-generation.workflow.json` — add `select_base_photos` tool node, rewire edges, edit `weekly_packet_draft` + `brand_qc` prompts.
- Modify `content-ops-defaults.md` — rewrite reuse constraint #2.

---

## Task 1: Migration + schema for `base_photo_usage`

**Files:**
- Create: `db/migrations/0005_base_photo_usage.sql`
- Modify: `src/db/schema.ts` (append new table)
- Modify: `src/db/index.ts` (fallback `migrationFiles` array, ~line 84)

- [ ] **Step 1: Write the migration SQL**

Create `db/migrations/0005_base_photo_usage.sql`:

```sql
-- Migration: base_photo_usage — running list of media used as image-edit base photos
-- Created: 2026-06-14

CREATE TABLE IF NOT EXISTS base_photo_usage (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  media_id    TEXT NOT NULL,
  used_at     TEXT NOT NULL,
  run_context TEXT
);

CREATE INDEX IF NOT EXISTS idx_base_photo_usage_team_media
  ON base_photo_usage (team_id, media_id);
```

- [ ] **Step 2: Add the drizzle table to schema.ts**

Append to `src/db/schema.ts` (after the `media` table block):

```ts
// Base-photo usage ledger — one row each time a human-tagged photo is handed
// out as an image-edit base. "Usage count" per media_id = number of rows.
export const basePhotoUsage = sqliteTable('base_photo_usage', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  mediaId: text('media_id').notNull(),
  usedAt: text('used_at').notNull(),
  runContext: text('run_context'),
});
```

- [ ] **Step 3: Register the migration in the fallback list**

In `src/db/index.ts`, find the fallback array (currently):

```ts
    const migrationFiles = ['0001_initial.sql', '0002_generation_jobs.sql', '0003_post_platform_publishes.sql', '0004_media_prompt.sql'];
```

Change it to:

```ts
    const migrationFiles = ['0001_initial.sql', '0002_generation_jobs.sql', '0003_post_platform_publishes.sql', '0004_media_prompt.sql', '0005_base_photo_usage.sql'];
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/kitchen-plugin-marketing && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0005_base_photo_usage.sql src/db/schema.ts src/db/index.ts
git commit -m "feat: base_photo_usage table + migration"
```

---

## Task 2: Selector core — `selectNextBasePhotos` (TDD)

The heart of the feature. Pure function over a better-sqlite3 handle so it tests in-memory with no filesystem/path dependency.

**Files:**
- Create: `src/api/base-photo-rotation.ts`
- Test: `src/api/base-photo-rotation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/base-photo-rotation.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { selectNextBasePhotos, getRotationStatus } from './base-photo-rotation';

// Build an in-memory DB with just the tables the selector touches.
function makeDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE media (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, filename TEXT NOT NULL,
      original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
      tags TEXT, url TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT NOT NULL
    );
    CREATE TABLE base_photo_usage (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, media_id TEXT NOT NULL,
      used_at TEXT NOT NULL, run_context TEXT
    );
  `);
  return sqlite;
}

function seedMedia(sqlite: any, rows: Array<{ id: string; tags: string[] }>, teamId = 'T') {
  const stmt = sqlite.prepare(
    `INSERT INTO media (id, team_id, filename, original_name, mime_type, size, tags, url, created_at, created_by)
     VALUES (?, ?, ?, ?, 'image/jpeg', 1, ?, ?, '2026-01-01', 'test')`,
  );
  for (const r of rows) stmt.run(r.id, teamId, `${r.id}.jpg`, `${r.id}.jpg`, JSON.stringify(r.tags), `/m/${r.id}`);
}

// Deterministic id/now injectors for assertions.
let counter = 0;
const opts = (over: any = {}) => ({
  teamId: 'T', count: 2, tags: ['human'], exclude: ['ai-generated'],
  runContext: 'test', now: '2026-06-14T00:00:00.000Z', uuid: () => `u${counter++}`,
  ...over,
});

describe('selectNextBasePhotos', () => {
  let sqlite: any;
  beforeEach(() => { counter = 0; sqlite = makeDb(); });

  it('returns only human-tagged, non-ai-generated photos', () => {
    seedMedia(sqlite, [
      { id: 'h1', tags: ['human', 'barber'] },
      { id: 'g1', tags: ['human', 'ai-generated'] }, // excluded
      { id: 'x1', tags: ['storefront'] },            // not human
    ]);
    const res = selectNextBasePhotos(sqlite, opts({ count: 5 }));
    const ids = res.photos.map((p) => p.id).sort();
    expect(ids).toEqual(['h1']);
    expect(res.poolSize).toBe(1);
  });

  it('records one usage row per returned photo (mark-at-selection)', () => {
    seedMedia(sqlite, [{ id: 'h1', tags: ['human'] }, { id: 'h2', tags: ['human'] }]);
    selectNextBasePhotos(sqlite, opts({ count: 2 }));
    const n = sqlite.prepare('SELECT COUNT(*) AS c FROM base_photo_usage').get().c;
    expect(n).toBe(2);
  });

  it('prefers never-used photos over already-used ones', () => {
    seedMedia(sqlite, [{ id: 'a', tags: ['human'] }, { id: 'b', tags: ['human'] }, { id: 'c', tags: ['human'] }]);
    // Burn "a" once.
    sqlite.prepare(`INSERT INTO base_photo_usage (id, team_id, media_id, used_at) VALUES ('seed','T','a','2026-01-01')`).run();
    const res = selectNextBasePhotos(sqlite, opts({ count: 2 }));
    const ids = res.photos.map((p) => p.id).sort();
    expect(ids).toEqual(['b', 'c']); // both never-used; "a" not chosen while fresh exist
  });

  it('restarts the cycle when all photos are used equally', () => {
    seedMedia(sqlite, [{ id: 'a', tags: ['human'] }, { id: 'b', tags: ['human'] }]);
    selectNextBasePhotos(sqlite, opts({ count: 2 })); // both -> count 1
    const res = selectNextBasePhotos(sqlite, opts({ count: 2 })); // pool exhausted -> next cycle
    expect(res.photos.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(res.cycle).toBe(1); // floor advanced
  });

  it('spans tiers when count exceeds the freshest tier', () => {
    seedMedia(sqlite, [{ id: 'a', tags: ['human'] }, { id: 'b', tags: ['human'] }, { id: 'c', tags: ['human'] }]);
    sqlite.prepare(`INSERT INTO base_photo_usage (id, team_id, media_id, used_at) VALUES ('s1','T','a','2026-01-01')`).run();
    sqlite.prepare(`INSERT INTO base_photo_usage (id, team_id, media_id, used_at) VALUES ('s2','T','b','2026-01-01')`).run();
    // freshest tier is just {c}; asking for 2 must also pull from the next tier.
    const res = selectNextBasePhotos(sqlite, opts({ count: 2 }));
    expect(res.photos.map((p) => p.id)).toContain('c'); // freshest always included
    expect(res.photos.length).toBe(2);
  });

  it('returns empty when the pool is empty', () => {
    const res = selectNextBasePhotos(sqlite, opts({ count: 3 }));
    expect(res.photos).toEqual([]);
    expect(res.poolSize).toBe(0);
  });
});

describe('getRotationStatus', () => {
  it('reports pool size, cycle, and never-used count', () => {
    const sqlite = makeDb();
    seedMedia(sqlite, [{ id: 'a', tags: ['human'] }, { id: 'b', tags: ['human'] }]);
    sqlite.prepare(`INSERT INTO base_photo_usage (id, team_id, media_id, used_at) VALUES ('s','T','a','2026-01-01')`).run();
    const st = getRotationStatus(sqlite, { teamId: 'T', tags: ['human'], exclude: ['ai-generated'] });
    expect(st.poolSize).toBe(2);
    expect(st.neverUsed).toBe(1);
    expect(st.cycle).toBe(0);
    expect(st.leastUsedCount).toBe(0);
    expect(st.mostUsedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/api/base-photo-rotation.test.ts`
Expected: FAIL — `Cannot find module './base-photo-rotation'`.

- [ ] **Step 3: Implement the selector**

Create `src/api/base-photo-rotation.ts`:

```ts
import { randomUUID } from 'crypto';

export type BasePhoto = {
  id: string;
  filename: string;        // stored filename on disk
  originalName: string;    // human-readable name
  tags: string[];
  url: string;
  usageCountBefore: number;
};

export type SelectResult = { photos: BasePhoto[]; poolSize: number; cycle: number };

export type RotationStatus = {
  poolSize: number;
  cycle: number;          // floor = MIN(usage_count); how many full passes completed
  usedThisCycle: number;  // photos already drawn in the in-progress pass (usage_count > cycle)
  neverUsed: number;
  leastUsedCount: number;
  mostUsedCount: number;
};

type Sqlite = { prepare: (sql: string) => any; transaction: (fn: (...a: any[]) => any) => any };

export type SelectOptions = {
  teamId: string;
  count: number;
  tags?: string[];        // ALL must be present (default ['human'])
  exclude?: string[];     // NONE may be present (default ['ai-generated'])
  runContext?: string | null;
  now?: string;           // ISO timestamp (injectable for tests)
  uuid?: () => string;    // id generator (injectable for tests)
};

// Build the tag WHERE fragment. Tags are stored as a JSON array text, e.g.
// ["human","barber"]; matching the quoted token avoids substring collisions
// (e.g. "man" never matches inside "human").
function tagWhere(tags: string[], exclude: string[]): { clause: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const t of tags) { parts.push(`m.tags LIKE ?`); params.push(`%"${t}"%`); }
  for (const t of exclude) { parts.push(`m.tags NOT LIKE ?`); params.push(`%"${t}"%`); }
  return { clause: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}

const USAGE_COUNT_SUBQUERY =
  `(SELECT COUNT(*) FROM base_photo_usage u WHERE u.media_id = m.id AND u.team_id = m.team_id)`;

export function selectNextBasePhotos(sqlite: Sqlite, options: SelectOptions): SelectResult {
  const tags = options.tags ?? ['human'];
  const exclude = options.exclude ?? ['ai-generated'];
  const count = Math.max(0, Math.floor(options.count));
  const now = options.now ?? new Date().toISOString();
  const newId = options.uuid ?? randomUUID;
  const { clause, params } = tagWhere(tags, exclude);

  const poolSize = sqlite
    .prepare(`SELECT COUNT(*) AS c FROM media m WHERE m.team_id = ?${clause}`)
    .get(options.teamId, ...params).c as number;

  const cycleRow = sqlite
    .prepare(`SELECT MIN(${USAGE_COUNT_SUBQUERY}) AS floor FROM media m WHERE m.team_id = ?${clause}`)
    .get(options.teamId, ...params);
  const cycle = (cycleRow?.floor ?? 0) as number;

  if (count === 0 || poolSize === 0) return { photos: [], poolSize, cycle };

  const rows = sqlite
    .prepare(
      `SELECT m.id, m.filename, m.original_name AS originalName, m.tags, m.url,
              ${USAGE_COUNT_SUBQUERY} AS usageCountBefore
       FROM media m
       WHERE m.team_id = ?${clause}
       ORDER BY usageCountBefore ASC, random()
       LIMIT ?`,
    )
    .all(options.teamId, ...params, count) as Array<any>;

  const insert = sqlite.prepare(
    `INSERT INTO base_photo_usage (id, team_id, media_id, used_at, run_context) VALUES (?, ?, ?, ?, ?)`,
  );
  const record = sqlite.transaction((items: any[]) => {
    for (const r of items) insert.run(newId(), options.teamId, r.id, now, options.runContext ?? null);
  });
  record(rows);

  const photos: BasePhoto[] = rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    originalName: r.originalName,
    tags: JSON.parse(r.tags || '[]'),
    url: r.url,
    usageCountBefore: r.usageCountBefore as number,
  }));

  return { photos, poolSize, cycle };
}

export function getRotationStatus(
  sqlite: Sqlite,
  options: { teamId: string; tags?: string[]; exclude?: string[] },
): RotationStatus {
  const tags = options.tags ?? ['human'];
  const exclude = options.exclude ?? ['ai-generated'];
  const { clause, params } = tagWhere(tags, exclude);

  const row = sqlite
    .prepare(
      `SELECT
         COUNT(*) AS poolSize,
         COALESCE(MIN(uc), 0) AS leastUsedCount,
         COALESCE(MAX(uc), 0) AS mostUsedCount,
         SUM(CASE WHEN uc = 0 THEN 1 ELSE 0 END) AS neverUsed
       FROM (
         SELECT ${USAGE_COUNT_SUBQUERY} AS uc FROM media m WHERE m.team_id = ?${clause}
       )`,
    )
    .get(options.teamId, ...params);

  const cycle = (row?.leastUsedCount ?? 0) as number;
  const usedThisCycle = sqlite
    .prepare(
      `SELECT COUNT(*) AS c FROM (
         SELECT ${USAGE_COUNT_SUBQUERY} AS uc FROM media m WHERE m.team_id = ?${clause}
       ) WHERE uc > ?`,
    )
    .get(options.teamId, ...params, cycle).c as number;

  return {
    poolSize: (row?.poolSize ?? 0) as number,
    cycle,
    usedThisCycle,
    neverUsed: (row?.neverUsed ?? 0) as number,
    leastUsedCount: (row?.leastUsedCount ?? 0) as number,
    mostUsedCount: (row?.mostUsedCount ?? 0) as number,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/api/base-photo-rotation.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/api/base-photo-rotation.ts src/api/base-photo-rotation.test.ts
git commit -m "feat: base-photo rotation selector + status (TDD)"
```

---

## Task 3: Handler routes

Wire HTTP → selector. Place these routes near the other `/media` routes (after the `GET /media` block, before the `/media/:id` regex match so the literal paths win).

**Files:**
- Modify: `src/api/handler.ts` (insert after the `if (req.path === '/media' && req.method === 'GET') { ... }` block, ~line 1170)

- [ ] **Step 1: Add the import**

At the top of `src/api/handler.ts`, with the other local imports, add:

```ts
import { selectNextBasePhotos, getRotationStatus } from './base-photo-rotation';
```

- [ ] **Step 2: Add the two routes**

Insert immediately after the `GET /media` handler block (before `const mediaIdMatch = ...`):

```ts
  // POST /media/base-rotation/next — deterministic next base photos + record usage
  if (req.path === '/media/base-rotation/next' && req.method === 'POST') {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
        count?: number; tags?: string[]; exclude?: string[]; runContext?: string;
      };
      const count = Number(body.count);
      if (!Number.isFinite(count) || count <= 0) {
        return apiError(400, 'INVALID_COUNT', 'count must be a positive number');
      }
      const { sqlite } = initializeDatabase(teamId);
      const result = selectNextBasePhotos(sqlite, {
        teamId,
        count,
        tags: Array.isArray(body.tags) ? body.tags : ['human'],
        exclude: Array.isArray(body.exclude) ? body.exclude : ['ai-generated'],
        runContext: body.runContext ?? 'weekly',
      });
      return { status: 200, data: result };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to select base photos');
    }
  }

  // GET /media/base-rotation/status — pool / cycle visibility
  if (req.path === '/media/base-rotation/status' && req.method === 'GET') {
    try {
      const tags = req.query.tags ? req.query.tags.split(',') : ['human'];
      const exclude = req.query.exclude ? req.query.exclude.split(',') : ['ai-generated'];
      const { sqlite } = initializeDatabase(teamId);
      return { status: 200, data: getRotationStatus(sqlite, { teamId, tags, exclude }) };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to read rotation status');
    }
  }
```

- [ ] **Step 3: Typecheck + full test run**

Run: `cd ~/kitchen-plugin-marketing && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Build the plugin**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build succeeds, `dist/` updated.

- [ ] **Step 5: Smoke test against the real team DB (in-process)**

Run:
```bash
cd ~/kitchen-plugin-marketing && node -e '
const { handleRequest } = require("./dist/api/handler.js");
(async () => {
  const status = await handleRequest({ method:"GET", path:"/media/base-rotation/status", query:{team:"hmx-marketing-team"}, headers:{}, body:null }, {});
  console.log("STATUS", JSON.stringify(status.data));
})();'
```
Expected: `poolSize` ~242, `neverUsed` ~242, `cycle` 0 (nothing recorded yet). **Do NOT** call `/next` here — that would record usage against the live DB before the workflow is wired.

- [ ] **Step 6: Commit**

```bash
git add src/api/handler.ts
git commit -m "feat: /media/base-rotation/next + /status routes"
```

---

## Task 4: Dashboard exec script `select-base-photos.mjs`

Called by the workflow `tool:exec` node. Imports the built plugin handler directly (same standalone-node pattern as the revenue backfill), calls `/next`, writes the picks file, fails loudly on empty pool.

**Files:**
- Create: `~/Sites/hmx-dashboard/scripts/select-base-photos.mjs`

- [ ] **Step 1: Inspect the existing exec script for conventions**

Run: `sed -n '1,40p' ~/Sites/hmx-dashboard/scripts/generate-pending-assets.mjs`
Note how it locates/imports the marketing plugin handler and parses `--team`. Mirror that import path exactly.

- [ ] **Step 2: Write the script**

Create `~/Sites/hmx-dashboard/scripts/select-base-photos.mjs`:

```js
#!/usr/bin/env node
// Selects this week's human base photos (deterministic rotation) and writes
// them to a stable file the weekly-packet draft LLM reads via {{file:...}}.
// Records usage in the marketing plugin's base_photo_usage ledger (mark-at-selection).
import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { homedir } from 'os';

const require = createRequire(import.meta.url);
const { handleRequest } = require(`${homedir()}/kitchen-plugin-marketing/dist/api/handler.js`);

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const team = arg('team', 'hmx-marketing-team');
const count = parseInt(arg('count', '7'), 10);
const outPath = arg(
  'out',
  `${homedir()}/.openclaw/workspace-${team}/shared-context/state/weekly-base-photos.current.md`,
);

(async () => {
  const res = await handleRequest(
    { method: 'POST', path: '/media/base-rotation/next', query: { team }, headers: {}, body: { count, runContext: 'weekly' } },
    {},
  );
  if ((res.status || 200) >= 400) {
    console.error('ERROR selecting base photos:', JSON.stringify(res.data));
    process.exit(1);
  }
  const { photos, poolSize, cycle } = res.data;
  if (!photos.length) {
    console.error(`ERROR: no human base photos available (poolSize=${poolSize}). Library is empty or all excluded.`);
    process.exit(1);
  }

  const lines = [
    '# Weekly base photos (auto-selected — USE EXACTLY THESE)',
    '',
    `Selected ${photos.length} of ${poolSize} human base photos (rotation cycle ${cycle}).`,
    'Use one base photo per distinct image concept, in the order listed. Reference each as `plugin-media:<id>`.',
    '',
    ...photos.map((p, i) => `${i + 1}. plugin-media:${p.id} — ${p.originalName}  (tags: ${p.tags.join(', ')})`),
    '',
  ];
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n'));
  console.log(`Wrote ${photos.length} base photos to ${outPath} (cycle ${cycle}, pool ${poolSize}).`);
})().catch((e) => { console.error('FATAL', e?.message || e); process.exit(1); });
```

- [ ] **Step 3: Dry-run is destructive — verify wiring without recording**

This script records usage when run, so do NOT run it ad hoc yet. Instead verify the import resolves only:

Run: `node -e 'import("'$HOME'/Sites/hmx-dashboard/scripts/select-base-photos.mjs").catch(()=>{})' --help 2>&1 | head -3`
Expected: no module-resolution error for the handler import. (It will attempt a real selection if it runs fully — interrupt is fine; we exercise it for real once in Task 6.)

- [ ] **Step 4: Commit (hmx-dashboard repo, on a feature branch)**

```bash
cd ~/Sites/hmx-dashboard && git checkout -b feat/base-photo-rotation-script
git add scripts/select-base-photos.mjs
git commit -m "feat: select-base-photos.mjs for weekly base-photo rotation"
```

---

## Task 5: Wire the workflow + update prose

**Files:**
- Modify: `~/.openclaw/workspace-hmx-marketing-team/shared-context/workflows/weekly-content-generation.workflow.json`
- Modify: `~/.openclaw/workspace-hmx-marketing-team/shared-context/content-ops-defaults.md`

- [ ] **Step 1: Add the `select_base_photos` tool node**

In the workflow JSON `nodes` array, add (after the `weekly_selection` node object):

```json
    {
      "id": "select_base_photos",
      "type": "tool",
      "name": "Select fresh base photos",
      "x": 170,
      "y": 200,
      "config": {
        "tool": "exec",
        "args": { "command": "node /Users/hairmx/Sites/hmx-dashboard/scripts/select-base-photos.mjs --team hmx-marketing-team --count 7" },
        "agentId": "hmx-marketing-team-lead",
        "timeoutMs": 120000
      }
    },
```

- [ ] **Step 2: Rewire edges so selection runs before the draft**

In the `edges` array: find the edge from `weekly_selection` → `weekly_packet_draft` and replace it with two edges so selection sits in between:

```json
    { "id": "e-selection-selectbase", "from": "weekly_selection", "to": "select_base_photos" },
    { "id": "e-selectbase-draft", "from": "select_base_photos", "to": "weekly_packet_draft" },
```

(Delete the original `weekly_selection → weekly_packet_draft` edge. Match the exact `from`/`to` ids in the file — node id is `weekly_packet_draft`.)

- [ ] **Step 3: Edit the `weekly_packet_draft` promptTemplate**

In the draft node's `promptTemplate`, (a) add a base-photos block after the SELECTED POSTS section:

```
=== ASSIGNED BASE PHOTOS (authoritative — use EXACTLY these) ===
{{file:shared-context/state/weekly-base-photos.current.md}}
```

and (b) replace the `HARD CONSTRAINT — FRESH BASE PHOTOS EACH WEEK:` bullet with:

```
- HARD CONSTRAINT — USE THE ASSIGNED BASE PHOTOS: The ASSIGNED BASE PHOTOS section above lists the exact human base photos selected for this week by the rotation system. Use ONLY these, one base photo per distinct image concept, in the order given. Reference each as `plugin-media:<id>`. Do NOT pick any other library photo as a base. Do NOT reuse a base photo for two different concepts.
```

- [ ] **Step 4: Edit the `brand_qc` promptTemplate**

Replace the QC rotation gate bullet (`the packet is NOT approval-ready if it appears to reuse base photos...`) with:

```
- the packet is NOT approval-ready if any image base photo is NOT one of the ASSIGNED BASE PHOTOS the rotation system selected this week (see shared-context/state/weekly-base-photos.current.md). The rotation system guarantees freshness; the packet must use exactly those `plugin-media:<id>` references and no off-list library photo.
```

- [ ] **Step 5: Update `content-ops-defaults.md` constraint #2**

Replace constraint #2 ("New human base photo each week...") with:

```
2. **Use the week's assigned base photos.** The rotation system selects fresh human base photos each weekly run and writes them to `shared-context/state/weekly-base-photos.current.md`. The packet MUST use exactly those `plugin-media:<id>` base photos (one per distinct image concept) and no other library photo. Selection is deterministic: never-used photos first, then least-recently-used, cycling through the whole library before any repeats — so freshness is guaranteed without manual rotation checks. If that file is missing or empty, the weekly run failed to select bases; stop and flag it rather than picking arbitrary photos.
```

- [ ] **Step 6: Validate the workflow JSON parses**

Run: `node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME+"/.openclaw/workspace-hmx-marketing-team/shared-context/workflows/weekly-content-generation.workflow.json","utf8")); console.log("JSON OK")'`
Expected: `JSON OK`.

- [ ] **Step 7: Commit workspace files**

```bash
cd ~/.openclaw/workspace-hmx-marketing-team/shared-context
git add workflows/weekly-content-generation.workflow.json content-ops-defaults.md 2>/dev/null || true
git commit -m "feat: deterministic base-photo rotation in weekly workflow" 2>/dev/null || echo "(workspace may not be a git repo — backup already taken)"
```

(If shared-context is not a git repo, the pre-change backup at `~/hmx-backups/base-photo-rotation-20260614-000721/` is the rollback.)

---

## Task 6: End-to-end verification (one real selection)

- [ ] **Step 1: Confirm dist is live**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build OK (idempotent).

- [ ] **Step 2: Run the selection script once, for real**

Run: `node ~/Sites/hmx-dashboard/scripts/select-base-photos.mjs --team hmx-marketing-team --count 7`
Expected: `Wrote 7 base photos to .../weekly-base-photos.current.md (cycle 0, pool 242).`

- [ ] **Step 3: Inspect the picks file**

Run: `cat ~/.openclaw/workspace-hmx-marketing-team/shared-context/state/weekly-base-photos.current.md`
Expected: 7 `plugin-media:<id>` lines with names + tags.

- [ ] **Step 4: Confirm usage was recorded and the next run rotates**

Run:
```bash
sqlite3 ~/.openclaw/kitchen/plugins/marketing/marketing-hmx-marketing-team.db \
  "SELECT COUNT(*) AS used, (SELECT COUNT(*) FROM base_photo_usage WHERE run_context='weekly') AS weekly FROM base_photo_usage;"
node ~/Sites/hmx-dashboard/scripts/select-base-photos.mjs --team hmx-marketing-team --count 7
```
Expected: first query shows 7 rows; the second run writes 7 **different** ids (verify by eye against the file from Step 3). Then 14 usage rows total.

- [ ] **Step 5: Check status endpoint reflects usage**

Run:
```bash
cd ~/kitchen-plugin-marketing && node -e '
const { handleRequest } = require("./dist/api/handler.js");
handleRequest({method:"GET",path:"/media/base-rotation/status",query:{team:"hmx-marketing-team"},headers:{},body:null},{}).then(r=>console.log(JSON.stringify(r.data)));'
```
Expected: `poolSize` 242, `neverUsed` 228, `usedThisCycle` 14, `cycle` 0.

- [ ] **Step 6: Reset the live ledger to a clean slate before first real workflow run (optional)**

The two verification runs recorded 14 real selections. If you want the first *actual* weekly run to start from a pristine "nothing used" state, clear them:

```bash
sqlite3 ~/.openclaw/kitchen/plugins/marketing/marketing-hmx-marketing-team.db "DELETE FROM base_photo_usage;"
```
(Leaving them is also fine — it just means those 14 are slightly de-prioritized for one cycle. Decide with RJ.)

---

## Task 7: Deploy + PRs

- [ ] **Step 1: Push + PR the plugin**

```bash
cd ~/kitchen-plugin-marketing && gh pr view 2>/dev/null || true
git push -u origin feat/base-photo-rotation
gh pr create --base main --title "Deterministic human base-photo rotation" --body "<summary + test notes>"
```

- [ ] **Step 2: Push + PR the dashboard script**

```bash
cd ~/Sites/hmx-dashboard && git push -u origin feat/base-photo-rotation-script
gh pr create --base main --title "select-base-photos.mjs (weekly base-photo rotation)" --body "<summary>"
```

- [ ] **Step 3: Restart the dashboard** so its in-process marketing handler picks up the rebuilt dist (the workflow exec node runs the script standalone, but the dashboard BFF also imports the handler).

Run: `launchctl kickstart -k gui/$UID/com.hairmx.hmx-dashboard`
Expected: dashboard restarts cleanly.

---

## Self-Review Notes

- **Spec coverage:** running list → Task 1 (`base_photo_usage`); deterministic hand-off → Tasks 2–4; mark-at-selection → Task 2 (transactional insert); random-among-unused + cycle restart → Task 2 `ORDER BY usage_count ASC, random()` + tests; workflow wiring → Task 5; status/"running low" signal → Tasks 2–3; testing → Task 2; deploy → Task 7. All covered.
- **Type consistency:** `selectNextBasePhotos`/`getRotationStatus` signatures identical across module, test, and handler. `BasePhoto.id`/`originalName`/`tags` match the script's `p.id`/`p.originalName`/`p.tags`.
- **Mark-at-selection caveat:** the two Task-6 verification runs DO write 14 live rows — Step 6 documents the reset choice rather than leaving it silent.
