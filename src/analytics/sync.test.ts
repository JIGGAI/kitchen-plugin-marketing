import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

vi.mock('../drivers/postiz-analytics', async () => {
  const actual = await vi.importActual<typeof import('../drivers/postiz-analytics')>('../drivers/postiz-analytics');
  return {
    ...actual,
    getPostAnalytics: vi.fn(),
  };
});

import { getPostAnalytics } from '../drivers/postiz-analytics';
import { syncPostMetrics, syncPostsBatch } from './sync';

function makeTeamId() {
  return `test-team-${randomUUID().slice(0, 8)}`;
}

async function seedDb(teamId: string, postId: string, publishExternalId: string, platform = 'instagram') {
  const { initializeDatabase } = await import('../db');
  const schema = await import('../db/schema');
  const { db } = initializeDatabase(teamId);
  const now = new Date().toISOString();

  db.insert(schema.posts).values({
    id: postId,
    teamId,
    content: 'test post',
    platforms: JSON.stringify([platform]),
    status: 'published',
    scheduledAt: null,
    publishedAt: now,
    tags: JSON.stringify([]),
    mediaIds: JSON.stringify([]),
    templateId: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'test',
  } as any).run();

  db.insert(schema.postPlatformPublishes).values({
    id: randomUUID(),
    teamId,
    postId,
    platform,
    externalId: publishExternalId,
    integrationId: 'int-1',
    publishedAt: now,
    syncedAt: null,
    createdAt: now,
  }).run();
}

function cleanupDbFile(teamId: string) {
  const dbFile = join(process.env.HOME || '', '.openclaw', 'kitchen', 'plugins', 'marketing', `marketing-${teamId}.db`);
  try { if (existsSync(dbFile)) unlinkSync(dbFile); } catch { /* ignore */ }
  try { if (existsSync(dbFile + '-wal')) unlinkSync(dbFile + '-wal'); } catch { /* ignore */ }
  try { if (existsSync(dbFile + '-shm')) unlinkSync(dbFile + '-shm'); } catch { /* ignore */ }
}

const fakeConfig = { apiKey: 'fake-key', baseUrl: 'http://postiz.fake' };

describe('syncPostMetrics', () => {
  let teamId: string;
  let postId: string;

  beforeEach(() => {
    teamId = makeTeamId();
    postId = randomUUID();
    vi.mocked(getPostAnalytics).mockReset();
  });

  afterEach(() => {
    cleanupDbFile(teamId);
  });

  it('inserts a new post_metrics row when none exists', async () => {
    await seedDb(teamId, postId, 'postiz-abc');
    vi.mocked(getPostAnalytics).mockResolvedValue({
      postId: 'postiz-abc',
      impressions: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
    });

    const result = await syncPostMetrics(teamId, postId, fakeConfig);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);

    const { initializeDatabase } = await import('../db');
    const schema = await import('../db/schema');
    const { db } = initializeDatabase(teamId);
    const rows = db.select().from(schema.postMetrics).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].impressions).toBe(1000);
    expect(rows[0].likes).toBe(50);
  });

  it('updates an existing post_metrics row (upsert)', async () => {
    await seedDb(teamId, postId, 'postiz-abc');
    vi.mocked(getPostAnalytics).mockResolvedValue({
      postId: 'postiz-abc', impressions: 100, likes: 10,
    });
    await syncPostMetrics(teamId, postId, fakeConfig);

    vi.mocked(getPostAnalytics).mockResolvedValue({
      postId: 'postiz-abc', impressions: 500, likes: 60,
    });
    const result = await syncPostMetrics(teamId, postId, fakeConfig);
    expect(result.synced).toBe(1);

    const { initializeDatabase } = await import('../db');
    const schema = await import('../db/schema');
    const { db } = initializeDatabase(teamId);
    const rows = db.select().from(schema.postMetrics).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].impressions).toBe(500);
    expect(rows[0].likes).toBe(60);
  });

  it('updates syncedAt on the publishes row after success', async () => {
    await seedDb(teamId, postId, 'postiz-abc');
    vi.mocked(getPostAnalytics).mockResolvedValue({
      postId: 'postiz-abc', impressions: 10,
    });

    await syncPostMetrics(teamId, postId, fakeConfig);

    const { initializeDatabase } = await import('../db');
    const schema = await import('../db/schema');
    const { db } = initializeDatabase(teamId);
    const rows = db.select().from(schema.postPlatformPublishes).all();
    expect(rows[0].syncedAt).toBeTruthy();
  });

  it('records an error and continues when Postiz returns null', async () => {
    await seedDb(teamId, postId, 'postiz-abc');
    vi.mocked(getPostAnalytics).mockResolvedValue(null);

    const result = await syncPostMetrics(teamId, postId, fakeConfig);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/instagram/);
  });

  it('returns zero counts for a post with no publishes', async () => {
    const { initializeDatabase } = await import('../db');
    initializeDatabase(teamId);

    const result = await syncPostMetrics(teamId, postId, fakeConfig);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
  });
});

describe('syncPostsBatch', () => {
  let teamId: string;

  beforeEach(() => {
    teamId = makeTeamId();
    vi.mocked(getPostAnalytics).mockReset();
  });

  afterEach(() => {
    cleanupDbFile(teamId);
  });

  it('processes multiple posts independently', async () => {
    const p1 = randomUUID();
    const p2 = randomUUID();
    await seedDb(teamId, p1, 'postiz-p1');
    await seedDb(teamId, p2, 'postiz-p2');

    vi.mocked(getPostAnalytics).mockImplementation(async (_cfg, extId) => {
      if (extId === 'postiz-p1') return { postId: extId, impressions: 100 };
      if (extId === 'postiz-p2') return null;
      return null;
    });

    const results = await syncPostsBatch(teamId, [p1, p2], fakeConfig);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.postId === p1)?.synced).toBe(1);
    expect(results.find((r) => r.postId === p2)?.failed).toBe(1);
  });
});
