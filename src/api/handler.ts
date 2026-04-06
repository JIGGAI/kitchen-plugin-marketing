import { and, desc, eq, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { KitchenPluginContext } from './types-kitchen';
import { initializeDatabase, encryptCredentials, decryptCredentials } from '../db';
import * as schema from '../db/schema';
import { createAllDrivers, createDriver, getPlatforms, type BackendSources, type PostContent } from '../drivers';
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
  return req.query.team || req.query.teamId || req.headers['x-team-id'] || 'default';
}

function getUserId(req: PluginRequest): string {
  return req.headers['x-user-id'] || 'system';
}

/* ================================================================== */
/*  Backend sources — build from request context                       */
/* ================================================================== */

function getBackendSources(req: PluginRequest, teamId: string): BackendSources {
  const sources: BackendSources = {};

  // Postiz
  const postizKey = req.query.postizApiKey || req.headers['x-postiz-api-key'];
  if (postizKey) {
    const baseUrl = req.query.postizBaseUrl || req.headers['x-postiz-base-url'] || 'https://api.postiz.com/public/v1';
    sources.postiz = { apiKey: postizKey, baseUrl: baseUrl.replace(/\/+$/, '') };
  }

  // Gateway channels
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json');
    const configPath5 = join(homedir(), '.openclaw', 'openclaw.json5');
    const actualPath = existsSync(configPath) ? configPath : existsSync(configPath5) ? configPath5 : null;
    if (actualPath) {
      const raw = readFileSync(actualPath, 'utf8');
      // Try plain JSON first; only strip comments (string-safe) if that fails
      let cfg: any;
      try {
        cfg = JSON.parse(raw);
      } catch {
        // Strip line comments only when NOT inside a JSON string.
        // Walk char by char to respect quoted regions.
        let cleaned = '';
        let inStr = false;
        let escape = false;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (escape) { cleaned += ch; escape = false; continue; }
          if (inStr) {
            if (ch === '\\') { escape = true; cleaned += ch; continue; }
            if (ch === '"') inStr = false;
            cleaned += ch;
            continue;
          }
          if (ch === '"') { inStr = true; cleaned += ch; continue; }
          if (ch === '/' && raw[i + 1] === '/') {
            // Skip to end of line
            while (i < raw.length && raw[i] !== '\n') i++;
            cleaned += '\n';
            continue;
          }
          if (ch === '/' && raw[i + 1] === '*') {
            i += 2;
            while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
            i++; // skip the closing '/'
            continue;
          }
          cleaned += ch;
        }
        cfg = JSON.parse(cleaned);
      }
      const plugins = cfg?.plugins?.entries || {};
      const channels: string[] = [];
      if (plugins.discord?.enabled) channels.push('discord');
      if (plugins.telegram?.enabled) channels.push('telegram');
      sources.gatewayChannels = channels;
    }
  } catch { /* ignore */ }

  // Stored accounts (decrypt credentials)
  try {
    const { db } = initializeDatabase(teamId);
    const accounts = db
      .select()
      .from(schema.socialAccounts)
      .where(and(eq(schema.socialAccounts.teamId, teamId), eq(schema.socialAccounts.isActive, true)))
      .all();

    sources.storedAccounts = accounts.map((a) => ({
      platform: a.platform,
      credentials: decryptCredentials(a.credentials) as any,
    }));
  } catch { /* ignore */ }

  return sources;
}

/* ================================================================== */
/*  Request router                                                     */
/* ================================================================== */

export async function handleRequest(req: PluginRequest, ctx: KitchenPluginContext): Promise<PluginResponse> {
  const teamId = getTeamId(req);

  // ---- /drivers (list all platform drivers with status) ----
  if (req.path === '/drivers' && req.method === 'GET') {
    try {
      const sources = getBackendSources(req, teamId);
      const drivers = createAllDrivers(sources);

      const results = await Promise.all(
        drivers.map(async (d) => {
          const status = await d.getStatus();
          const caps = d.getCapabilities();
          return {
            platform: d.platform,
            label: d.label,
            icon: d.icon,
            ...status,
            capabilities: caps,
          };
        })
      );

      return { status: 200, data: { drivers: results } };
    } catch (error: any) {
      return apiError(500, 'DRIVER_ERROR', error?.message || 'Failed to load drivers');
    }
  }

  // ---- /drivers/:platform/status ----
  if (req.path.match(/^\/drivers\/([^/]+)\/status$/) && req.method === 'GET') {
    const platform = req.path.split('/')[2];
    const sources = getBackendSources(req, teamId);
    const driver = createDriver(platform, {
      postiz: sources.postiz,
      gateway: sources.gatewayChannels?.includes(platform) ? { channel: platform } : undefined,
      direct: sources.storedAccounts?.find((a) => a.platform === platform)?.credentials as any,
    });
    if (!driver) return apiError(404, 'NOT_FOUND', `No driver for platform: ${platform}`);

    const status = await driver.getStatus();
    const caps = driver.getCapabilities();
    return { status: 200, data: { platform, ...status, capabilities: caps } };
  }

  // ---- /publish (unified multi-platform publish) ----
  if (req.path === '/publish' && req.method === 'POST') {
    const body = req.body as {
      content: string;
      platforms: string[];
      mediaUrls?: string[];
      scheduledAt?: string;
      settings?: Record<string, Record<string, unknown>>; // per-platform settings
    };

    if (!body?.content || !body?.platforms?.length) {
      return apiError(400, 'VALIDATION_ERROR', 'content and platforms[] are required');
    }

    const sources = getBackendSources(req, teamId);
    const results: Array<{ platform: string; success: boolean; postId?: string; error?: string; backend?: string }> = [];

    for (const platform of body.platforms) {
      const driver = createDriver(platform, {
        postiz: sources.postiz,
        gateway: sources.gatewayChannels?.includes(platform) ? { channel: platform } : undefined,
        direct: sources.storedAccounts?.find((a) => a.platform === platform)?.credentials as any,
      });

      if (!driver) {
        results.push({ platform, success: false, error: `No driver for ${platform}` });
        continue;
      }

      const status = await driver.getStatus();
      if (!status.connected) {
        results.push({ platform, success: false, error: `Not connected`, backend: status.backend });
        continue;
      }

      const postContent: PostContent = {
        text: body.content,
        mediaUrls: body.mediaUrls,
        scheduledAt: body.scheduledAt,
        settings: body.settings?.[platform],
      };

      const result = await driver.publish(postContent);
      results.push({
        platform,
        success: result.success,
        postId: result.postId,
        error: result.error,
        backend: status.backend,
      });
    }

    const allOk = results.every((r) => r.success);
    return { status: allOk ? 201 : 207, data: { results } };
  }

  // ---- /platforms (list available platforms) ----
  if (req.path === '/platforms' && req.method === 'GET') {
    const sources = getBackendSources(req, teamId);
    const drivers = createAllDrivers(sources);
    const platforms = drivers.map((d) => ({
      platform: d.platform,
      label: d.label,
      icon: d.icon,
      capabilities: d.getCapabilities(),
    }));
    return { status: 200, data: { platforms } };
  }

  // ---- LEGACY /providers (keep for backward compat) ----
  if (req.path === '/providers' && req.method === 'GET') {
    try {
      const sources = getBackendSources(req, teamId);
      const drivers = createAllDrivers(sources);
      const providers = await Promise.all(
        drivers.map(async (d) => {
          const status = await d.getStatus();
          if (!status.connected) return null;
          return {
            id: `${status.backend}:${d.platform}`,
            type: status.backend,
            platform: d.platform,
            displayName: status.displayName,
            username: status.username,
            avatar: status.avatar,
            isActive: status.connected,
            capabilities: status.backend === 'postiz' ? ['post', 'schedule'] : ['post'],
            meta: { integrationId: status.integrationId },
          };
        })
      );
      return { status: 200, data: { providers: providers.filter(Boolean) } };
    } catch (error: any) {
      return apiError(500, 'DETECT_ERROR', error?.message || 'Failed to detect providers');
    }
  }

  // ---- /posts (local drafts) ----
  if (req.path === '/posts' && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const { limit, offset } = parsePagination(req.query);

      const conditions = [eq(schema.posts.teamId, teamId)];
      if (req.query.status) conditions.push(eq(schema.posts.status, String(req.query.status)));
      if (req.query.platform) conditions.push(like(schema.posts.platforms, `%"${req.query.platform}"%`));

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

  // ---- /accounts (local stored accounts) ----
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

  // ---- /posts/:id (get single post) ----
  const singlePostMatch = req.path.match(/^\/posts\/([a-f0-9-]+)$/);
  if (singlePostMatch && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const [post] = await db
        .select()
        .from(schema.posts)
        .where(and(eq(schema.posts.id, singlePostMatch[1]), eq(schema.posts.teamId, teamId)));
      if (!post) return apiError(404, 'NOT_FOUND', 'Post not found');
      return {
        status: 200,
        data: {
          ...post,
          platforms: JSON.parse(post.platforms || '[]'),
          tags: JSON.parse(post.tags || '[]'),
          mediaIds: JSON.parse(post.mediaIds || '[]'),
        },
      };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  // ---- DELETE /posts/:id ----
  if (singlePostMatch && req.method === 'DELETE') {
    try {
      const { db } = initializeDatabase(teamId);
      const [post] = await db
        .select()
        .from(schema.posts)
        .where(and(eq(schema.posts.id, singlePostMatch[1]), eq(schema.posts.teamId, teamId)));
      if (!post) return apiError(404, 'NOT_FOUND', 'Post not found');
      await db.delete(schema.posts).where(eq(schema.posts.id, singlePostMatch[1]));
      return { status: 200, data: { deleted: true, id: singlePostMatch[1] } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  // ---- PATCH /posts/:id ----
  if (singlePostMatch && req.method === 'PATCH') {
    try {
      const { db } = initializeDatabase(teamId);
      const [post] = await db
        .select()
        .from(schema.posts)
        .where(and(eq(schema.posts.id, singlePostMatch[1]), eq(schema.posts.teamId, teamId)));
      if (!post) return apiError(404, 'NOT_FOUND', 'Post not found');
      const body = (req.body || {}) as Partial<PostCreateRequest>;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.content !== undefined) updates.content = body.content;
      if (body.platforms !== undefined) updates.platforms = JSON.stringify(body.platforms);
      if (body.status !== undefined) updates.status = body.status;
      if (body.scheduledAt !== undefined) updates.scheduledAt = body.scheduledAt || null;
      if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
      await db.update(schema.posts).set(updates).where(eq(schema.posts.id, singlePostMatch[1]));
      return { status: 200, data: { updated: true, id: singlePostMatch[1] } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  return apiError(501, 'NOT_IMPLEMENTED', `No handler for ${req.method} ${req.path}`);
}
