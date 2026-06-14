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
