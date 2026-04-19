import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import { getPostAnalytics, normalizeMetrics } from '../drivers/postiz-analytics';
import type { PostizConfig } from '../drivers/postiz-backend';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export interface BatchSyncResult {
  postId: string;
  synced: number;
  failed: number;
  errors: string[];
}

export async function syncPostMetrics(
  teamId: string,
  postId: string,
  postizConfig: PostizConfig,
): Promise<SyncResult> {
  const { db } = initializeDatabase(teamId);

  const publishes = db
    .select()
    .from(schema.postPlatformPublishes)
    .where(and(
      eq(schema.postPlatformPublishes.postId, postId),
      eq(schema.postPlatformPublishes.teamId, teamId),
    ))
    .all();

  const errors: string[] = [];
  let synced = 0;

  for (const pub of publishes) {
    try {
      const raw = await getPostAnalytics(postizConfig, pub.externalId);
      if (!raw) {
        errors.push(`${pub.platform}: no analytics returned`);
        continue;
      }
      const metrics = normalizeMetrics(raw, pub.platform);
      const now = new Date().toISOString();

      const existing = db
        .select()
        .from(schema.postMetrics)
        .where(and(
          eq(schema.postMetrics.postId, postId),
          eq(schema.postMetrics.platform, pub.platform),
        ))
        .all();

      const row = {
        impressions: metrics.impressions,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        clicks: metrics.clicks,
        engagementRate: metrics.engagementRate,
        platformDetails: JSON.stringify(metrics.platformDetails),
        syncedAt: now,
      };

      if (existing.length) {
        db.update(schema.postMetrics)
          .set(row)
          .where(eq(schema.postMetrics.id, existing[0].id))
          .run();
      } else {
        db.insert(schema.postMetrics).values({
          id: randomUUID(),
          postId,
          platform: pub.platform,
          ...row,
        }).run();
      }

      db.update(schema.postPlatformPublishes)
        .set({ syncedAt: now })
        .where(eq(schema.postPlatformPublishes.id, pub.id))
        .run();
      synced++;
    } catch (error: any) {
      errors.push(`${pub.platform}: ${error?.message || String(error)}`);
    }
  }

  return { synced, failed: errors.length, errors };
}

export async function syncPostsBatch(
  teamId: string,
  postIds: string[],
  postizConfig: PostizConfig,
): Promise<BatchSyncResult[]> {
  const results: BatchSyncResult[] = [];
  for (const postId of postIds) {
    const result = await syncPostMetrics(teamId, postId, postizConfig);
    results.push({ postId, ...result });
  }
  return results;
}
