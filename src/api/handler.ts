import { and, desc, eq, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { KitchenPluginContext } from './types-kitchen';
import { initializeDatabase, encryptCredentials } from '../db';
import * as schema from '../db/schema';
import type {
  ApiError,
  PaginatedResponse,
  PostCreateRequest,
  PostResponse,
  SocialAccountCreateRequest,
  SocialAccountResponse,
} from '../types';

export type PluginRequest = {
  method: string;
  path: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  body: unknown;
};

export type PluginResponse = {
  status?: number;
  headers?: Record<string, string>;
  data?: unknown;
};

function apiError(status: number, error: string, message: string, details?: unknown): PluginResponse {
  const payload: ApiError = { error, message, details };
  return { status, data: payload };
}

function parsePagination(query: Record<string, string | undefined>) {
  const limit = Math.min(parseInt(query.limit || '20', 10) || 20, 100);
  const offset = parseInt(query.offset || '0', 10) || 0;
  return { limit, offset };
}

function getTeamId(req: PluginRequest): string {
  return (
    req.query.team ||
    req.query.teamId ||
    req.headers['x-team-id'] ||
    'default'
  );
}

function getUserId(req: PluginRequest): string {
  return req.headers['x-user-id'] || 'system';
}

export async function handleRequest(req: PluginRequest, _ctx: KitchenPluginContext): Promise<PluginResponse> {
  const teamId = getTeamId(req);

  // NOTE: This plugin currently uses its own per-team SQLite DB via initializeDatabase(teamId).
  // In the future we can move to ctx.db once Kitchen exposes per-plugin schema support.

  // -----------------------------
  // POSTS
  // -----------------------------
  if (req.path === '/posts' && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const { limit, offset } = parsePagination(req.query);

      const conditions = [eq(schema.posts.teamId, teamId)];

      if (req.query.status) {
        conditions.push(eq(schema.posts.status, String(req.query.status)));
      }

      if (req.query.platform) {
        conditions.push(like(schema.posts.platforms, `%\"${req.query.platform}\"%`));
      }

      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.posts)
        .where(and(...conditions));
      const total = totalResult[0]?.count ?? 0;

      const posts = await db
        .select()
        .from(schema.posts)
        .where(and(...conditions))
        .orderBy(desc(schema.posts.createdAt))
        .limit(limit)
        .offset(offset);

      const transformed: PostResponse[] = posts.map((post) => ({
        id: post.id,
        content: post.content,
        platforms: JSON.parse(post.platforms || '[]'),
        status: post.status as any,
        scheduledAt: post.scheduledAt || undefined,
        publishedAt: post.publishedAt || undefined,
        tags: JSON.parse(post.tags || '[]'),
        mediaIds: JSON.parse(post.mediaIds || '[]'),
        templateId: post.templateId || undefined,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        createdBy: post.createdBy,
      }));

      const payload: PaginatedResponse<PostResponse> = {
        data: transformed,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      };

      return { status: 200, data: payload };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  if (req.path === '/posts' && req.method === 'POST') {
    try {
      const userId = getUserId(req);
      const body = (req.body || {}) as PostCreateRequest;

      if (!body.content || !Array.isArray(body.platforms) || body.platforms.length === 0) {
        return apiError(400, 'VALIDATION_ERROR', 'Content and platforms are required');
      }

      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();

      const newPost = {
        id: randomUUID(),
        teamId,
        content: body.content,
        platforms: JSON.stringify(body.platforms),
        status: body.status || 'draft',
        scheduledAt: body.scheduledAt || null,
        publishedAt: null,
        tags: JSON.stringify(body.tags || []),
        mediaIds: JSON.stringify(body.mediaIds || []),
        templateId: body.templateId || null,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      };

      await db.insert(schema.posts).values(newPost);

      const response: PostResponse = {
        id: newPost.id,
        content: newPost.content,
        platforms: JSON.parse(newPost.platforms),
        status: newPost.status as any,
        scheduledAt: newPost.scheduledAt || undefined,
        publishedAt: undefined,
        tags: JSON.parse(newPost.tags),
        mediaIds: JSON.parse(newPost.mediaIds),
        templateId: newPost.templateId || undefined,
        createdAt: newPost.createdAt,
        updatedAt: newPost.updatedAt,
        createdBy: newPost.createdBy,
      };

      return { status: 201, data: response };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  // -----------------------------
  // ACCOUNTS
  // -----------------------------
  if (req.path === '/accounts' && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);

      const accounts = await db
        .select()
        .from(schema.socialAccounts)
        .where(eq(schema.socialAccounts.teamId, teamId))
        .orderBy(desc(schema.socialAccounts.createdAt));

      const response: SocialAccountResponse[] = accounts.map((account) => ({
        id: account.id,
        platform: account.platform,
        displayName: account.displayName,
        username: account.username || undefined,
        avatar: account.avatar || undefined,
        isActive: account.isActive,
        settings: JSON.parse(account.settings || '{}'),
        lastSync: account.lastSync || undefined,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      }));

      return { status: 200, data: { accounts: response } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  if (req.path === '/accounts' && req.method === 'POST') {
    try {
      const body = (req.body || {}) as SocialAccountCreateRequest;

      if (!body.platform || !body.displayName || !body.credentials) {
        return apiError(400, 'VALIDATION_ERROR', 'platform, displayName, and credentials are required');
      }

      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();

      const newAccount = {
        id: randomUUID(),
        teamId,
        platform: body.platform,
        displayName: body.displayName,
        username: body.username || null,
        avatar: null,
        isActive: true,
        credentials: encryptCredentials(body.credentials) as any,
        settings: JSON.stringify(body.settings || {}),
        lastSync: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.socialAccounts).values(newAccount);

      const response: SocialAccountResponse = {
        id: newAccount.id,
        platform: newAccount.platform,
        displayName: newAccount.displayName,
        username: newAccount.username || undefined,
        isActive: newAccount.isActive,
        settings: JSON.parse(newAccount.settings),
        createdAt: newAccount.createdAt,
        updatedAt: newAccount.updatedAt,
      };

      return { status: 201, data: response };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  return apiError(501, 'NOT_IMPLEMENTED', `No handler for ${req.method} ${req.path}`);
}
