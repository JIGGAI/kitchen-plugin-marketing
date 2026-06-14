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
