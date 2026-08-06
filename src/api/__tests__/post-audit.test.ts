import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { buildAuditRow, diffFields, parseActor, recordAudit } from '../post-audit';

// Real SQLite, no mocks — the table's whole value is that a row is there after
// the fact, which only a real write proves.
let dir: string;
let sqlite: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'post-audit-'));
  sqlite = new Database(path.join(dir, 'test.db'));
  sqlite.exec(`
    CREATE TABLE post_audit (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      actor_email TEXT,
      changes TEXT,
      at TEXT NOT NULL
    );
  `);
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('parseActor', () => {
  it('splits the dashboard form into id and email', () => {
    // Email is carried so a row stays readable after someone leaves and their
    // id means nothing on its own.
    expect(parseActor('user:abc-123|rj@hairmx.com')).toEqual({
      actorId: 'user:abc-123',
      actorEmail: 'rj@hairmx.com',
    });
  });

  it('keeps an automation label as-is', () => {
    expect(parseActor('workflow:weekly-plan-sync')).toEqual({
      actorId: 'workflow:weekly-plan-sync',
      actorEmail: null,
    });
  });

  it('falls back to system rather than a null actor', () => {
    // A blank actor is exactly the ambiguity this table exists to remove, so
    // "unknown" gets a name.
    expect(parseActor(undefined)).toEqual({ actorId: 'system', actorEmail: null });
    expect(parseActor('   ')).toEqual({ actorId: 'system', actorEmail: null });
  });
});

describe('diffFields', () => {
  it('records only what actually changed', () => {
    const changes = diffFields(
      { status: 'draft', content: 'same', scheduledAt: null },
      { status: 'scheduled', content: 'same' },
    );
    expect(changes).toEqual({ status: ['draft', 'scheduled'] });
  });

  it('ignores fields the PATCH did not mention', () => {
    // A PATCH that omits a field must not read as "cleared it".
    const changes = diffFields({ status: 'draft', content: 'hello' }, { status: 'scheduled' });
    expect(Object.keys(changes)).toEqual(['status']);
  });

  it('compares arrays and objects by value, not identity', () => {
    // platforms/tags/mediaIds are re-parsed on every request; comparing by
    // reference would log a change on every no-op write.
    expect(diffFields({ platforms: ['instagram'] }, { platforms: ['instagram'] })).toEqual({});
    expect(diffFields({ platforms: ['instagram'] }, { platforms: ['facebook'] })).toEqual({
      platforms: [['instagram'], ['facebook']],
    });
  });

  it('treats undefined and null as the same absent value', () => {
    expect(diffFields({ scheduledAt: undefined }, { scheduledAt: null })).toEqual({});
  });
});

describe('recordAudit', () => {
  const actor = { actorId: 'user:abc', actorEmail: 'rj@hairmx.com' };

  it('writes one readable row per action', () => {
    recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'post', entityId: 'p1', action: 'update', actor,
      changes: { status: ['draft', 'scheduled'] },
    }));
    const rows = sqlite.prepare('SELECT * FROM post_audit').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      team_id: 't1', entity: 'post', entity_id: 'p1', action: 'update',
      actor_id: 'user:abc', actor_email: 'rj@hairmx.com',
    });
    expect(JSON.parse(rows[0].changes)).toEqual({ status: ['draft', 'scheduled'] });
    expect(rows[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('answers "what happened to this post" in order', () => {
    // The question both the 2026-07-23 and 2026-08-05 incidents started from.
    for (const [action, changes, at] of [
      ['create', { status: [null, 'draft'] }, '2026-08-05T12:29:41.000Z'],
      ['update', { status: ['draft', 'scheduled'] }, '2026-08-05T13:25:46.000Z'],
      ['update', { status: ['scheduled', 'draft'] }, '2026-08-06T22:40:00.000Z'],
    ] as const) {
      recordAudit(sqlite, buildAuditRow({
        teamId: 't1', entity: 'post', entityId: 'p1', action: action as any,
        actor, changes: changes as any, at,
      }));
    }
    const rows = sqlite.prepare(
      'SELECT action, changes FROM post_audit WHERE entity_id = ? ORDER BY at ASC',
    ).all('p1') as any[];
    expect(rows.map((r) => r.action)).toEqual(['create', 'update', 'update']);
    expect(JSON.parse(rows[1].changes).status).toEqual(['draft', 'scheduled']);
  });

  it('distinguishes an automation from a person', () => {
    // The distinction that was missing on 2026-08-05, when 20 posts were
    // auto-published and looked exactly like human approvals.
    recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'post', entityId: 'p1', action: 'update',
      actor: parseActor('workflow:weekly-plan-sync'),
      changes: { status: ['draft', 'scheduled'] },
    }));
    recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'post', entityId: 'p2', action: 'update',
      actor: parseActor('user:abc|rj@hairmx.com'),
      changes: { status: ['draft', 'scheduled'] },
    }));
    const machine = sqlite.prepare("SELECT entity_id FROM post_audit WHERE actor_id LIKE 'workflow:%'").all() as any[];
    expect(machine.map((r) => r.entity_id)).toEqual(['p1']);
  });

  it('stores null rather than an empty object when nothing changed', () => {
    recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'post', entityId: 'p1', action: 'update', actor, changes: {},
    }));
    expect((sqlite.prepare('SELECT changes FROM post_audit').get() as any).changes).toBeNull();
  });

  it('records a deletion with what the row was', () => {
    // After the DELETE there is nothing left to join back to, so the
    // identifying fields have to live in the audit row itself.
    recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'post', entityId: 'gone', action: 'delete', actor,
      changes: { status: ['scheduled', null], platforms: [['instagram'], null] },
    }));
    const row = sqlite.prepare("SELECT * FROM post_audit WHERE action = 'delete'").get() as any;
    expect(JSON.parse(row.changes).status).toEqual(['scheduled', null]);
  });

  it('covers media in the same table', () => {
    recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'media', entityId: 'm1', action: 'delete', actor,
      changes: { filename: ['shot.jpg', null] },
    }));
    const row = sqlite.prepare("SELECT entity FROM post_audit WHERE entity_id = 'm1'").get() as any;
    expect(row.entity).toBe('media');
  });

  it('throws instead of silently skipping when the table is missing', () => {
    // For a table whose purpose is accountability, a silent gap is worse than
    // a failed mutation — the caller is meant to fail with it.
    sqlite.exec('DROP TABLE post_audit');
    expect(() => recordAudit(sqlite, buildAuditRow({
      teamId: 't1', entity: 'post', entityId: 'p1', action: 'delete', actor,
    }))).toThrow();
  });
});
