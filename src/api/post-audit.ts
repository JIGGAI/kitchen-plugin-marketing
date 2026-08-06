// Attribution for post/media create-update-delete.
//
// Two incidents motivated this. On 2026-07-23, 22 posts were deleted and who
// did it could not be determined. On 2026-08-05, 20 unapproved posts were
// pushed to Postiz by an automation and were indistinguishable in the UI from
// human approvals. Both were reconstructed by diffing hourly DB snapshots —
// slow, and only possible because a snapshot happened to straddle the change.
//
// What this records is deliberately narrow: WHO acted, on WHAT, and WHICH
// fields moved. Recovery is already covered by the hourly/daily DB backups, so
// there are no full row snapshots here.

import { randomUUID } from 'crypto';

export type AuditEntity = 'post' | 'media';
export type AuditAction = 'create' | 'update' | 'delete';

/** Field-level diff: { status: [before, after] }. */
export type AuditChanges = Record<string, [unknown, unknown]>;

export type AuditActor = { actorId: string | null; actorEmail: string | null };

/**
 * Split an `x-user-id` header into an id and, when the caller sent one, an
 * email.
 *
 * The dashboard sends `user:<id>|<email>` so a row stays readable after someone
 * leaves and their id means nothing. Automation sends a bare label
 * (`workflow:weekly-plan-sync`), and anything unattributed becomes `system` —
 * never null, because a blank actor is exactly the ambiguity this table exists
 * to remove.
 */
export function parseActor(userId: string | null | undefined): AuditActor {
  const raw = String(userId || '').trim();
  if (!raw) return { actorId: 'system', actorEmail: null };
  const sep = raw.indexOf('|');
  if (sep === -1) return { actorId: raw, actorEmail: null };
  const id = raw.slice(0, sep).trim();
  const email = raw.slice(sep + 1).trim();
  return { actorId: id || 'system', actorEmail: email || null };
}

/**
 * Fields that differ between two versions of a row, as [before, after].
 *
 * Only keys present in `after` are considered, so a PATCH that omits a field
 * never reads as "cleared". Values are compared by JSON shape so arrays and
 * objects (platforms, tags, mediaIds) don't register a change on every write.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditChanges {
  const changes: AuditChanges = {};
  if (!after) return changes;
  for (const key of Object.keys(after)) {
    const a = before ? before[key] : undefined;
    const b = after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    changes[key] = [a ?? null, b ?? null];
  }
  return changes;
}

export type AuditRow = {
  id: string;
  teamId: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actorId: string | null;
  actorEmail: string | null;
  changes: string | null;
  at: string;
};

export function buildAuditRow(input: {
  teamId: string;
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  actor: AuditActor;
  changes?: AuditChanges | null;
  at?: string;
}): AuditRow {
  const changes = input.changes && Object.keys(input.changes).length ? input.changes : null;
  return {
    id: randomUUID(),
    teamId: input.teamId,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actor.actorId,
    actorEmail: input.actor.actorEmail,
    changes: changes ? JSON.stringify(changes) : null,
    at: input.at || new Date().toISOString(),
  };
}

/**
 * Write an audit row.
 *
 * Deliberately NOT wrapped in try/catch by callers: for a table whose whole
 * purpose is accountability, a silent gap is worse than a failed mutation. A
 * post must never be deleted without its audit row, so this throwing takes the
 * mutation down with it.
 */
export function recordAudit(
  sqlite: { prepare: (sql: string) => { run: (...args: any[]) => unknown } },
  row: AuditRow,
): AuditRow {
  sqlite
    .prepare(
      `INSERT INTO post_audit (id, team_id, entity, entity_id, action, actor_id, actor_email, changes, at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(row.id, row.teamId, row.entity, row.entityId, row.action, row.actorId, row.actorEmail, row.changes, row.at);
  return row;
}
