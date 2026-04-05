import { and, desc, eq, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { KitchenPluginContext } from './types-kitchen';
import { initializeDatabase, encryptCredentials, decryptCredentials } from '../db';
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

/* ================================================================== */
/*  Postiz integration helpers                                         */
/* ================================================================== */

interface PostizConfig {
  apiKey: string;
  baseUrl: string; // e.g. https://api.postiz.com/public/v1  or self-hosted
}

function getPostizConfig(req: PluginRequest): PostizConfig | null {
  // Check query params first, then headers
  const apiKey = req.query.postizApiKey || req.headers['x-postiz-api-key'];
  const baseUrl = req.query.postizBaseUrl || req.headers['x-postiz-base-url'] || 'https://api.postiz.com/public/v1';
  if (!apiKey) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, '') };
}

async function postizFetch(config: PostizConfig, path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': config.apiKey,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
}

/* ================================================================== */
/*  Auto-detect providers                                              */
/* ================================================================== */

interface DetectedProvider {
  id: string;
  type: 'postiz' | 'gateway' | 'skill';
  platform: string;
  displayName: string;
  username?: string;
  avatar?: string;
  isActive: boolean;
  capabilities: string[];
  meta?: Record<string, unknown>;
}

/**
 * Detect available social posting providers from:
 * 1. Postiz (if API key configured) — list connected integrations
 * 2. Gateway message channels (discord, telegram) — can post to channels
 * 3. Skills that support posting (none currently, placeholder)
 */
async function detectProviders(req: PluginRequest, teamId: string): Promise<DetectedProvider[]> {
  const providers: DetectedProvider[] = [];

  // --- 1. Postiz integrations ---
  const postizCfg = getPostizConfig(req);
  if (postizCfg) {
    try {
      const res = await postizFetch(postizCfg, '/integrations');
      if (res.ok) {
        const data = await res.json();
        const integrations = Array.isArray(data) ? data : (data.integrations || []);
        for (const integ of integrations) {
          providers.push({
            id: `postiz:${integ.id}`,
            type: 'postiz',
            platform: integ.providerIdentifier || integ.provider || 'unknown',
            displayName: integ.name || integ.providerIdentifier || 'Postiz account',
            username: integ.username || undefined,
            avatar: integ.picture || integ.avatar || undefined,
            isActive: !integ.disabled,
            capabilities: ['post', 'schedule'],
            meta: { postizId: integ.id, provider: integ.providerIdentifier },
          });
        }
      }
    } catch {
      // Postiz not reachable — skip silently
    }
  }

  // --- 2. Gateway messaging channels ---
  // These are read from the openclaw config and exposed as "posting targets"
  // Discord and Telegram are confirmed enabled in this installation.
  try {
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const plugins = cfg?.plugins?.entries || {};

      if (plugins.discord?.enabled) {
        providers.push({
          id: 'gateway:discord',
          type: 'gateway',
          platform: 'discord',
          displayName: 'Discord (via OpenClaw)',
          isActive: true,
          capabilities: ['post'],
          meta: { channel: 'discord' },
        });
      }

      if (plugins.telegram?.enabled) {
        providers.push({
          id: 'gateway:telegram',
          type: 'gateway',
          platform: 'telegram',
          displayName: 'Telegram (via OpenClaw)',
          isActive: true,
          capabilities: ['post'],
          meta: { channel: 'telegram' },
        });
      }
    }
  } catch {
    // Config read failed — skip
  }

  return providers;
}

/* ================================================================== */
/*  Postiz: create/schedule post                                       */
/* ================================================================== */

interface PublishRequest {
  content: string;
  integrationIds: string[]; // postiz integration IDs
  scheduledAt?: string; // ISO datetime
  settings?: Record<string, unknown>; // per-platform settings
  mediaUrls?: string[];
}

async function postizPublish(config: PostizConfig, body: PublishRequest): Promise<PluginResponse> {
  const payload: Record<string, unknown> = {
    content: body.content,
    integrationIds: body.integrationIds,
  };

  if (body.scheduledAt) {
    payload.date = body.scheduledAt;
  }

  if (body.settings) {
    payload.settings = body.settings;
  }

  if (body.mediaUrls && body.mediaUrls.length > 0) {
    payload.media = body.mediaUrls.map((url) => ({ url }));
  }

  const res = await postizFetch(config, '/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return apiError(res.status, 'POSTIZ_ERROR', data?.message || `Postiz returned ${res.status}`, data);
  }

  return { status: 201, data };
}

/* ================================================================== */
/*  Request router                                                     */
/* ================================================================== */

export async function handleRequest(req: PluginRequest, ctx: KitchenPluginContext): Promise<PluginResponse> {
  const teamId = getTeamId(req);

  // ---- /providers (auto-detect) ----
  if (req.path === '/providers' && req.method === 'GET') {
    try {
      const providers = await detectProviders(req, teamId);
      return { status: 200, data: { providers } };
    } catch (error: any) {
      return apiError(500, 'DETECT_ERROR', error?.message || 'Failed to detect providers');
    }
  }

  // ---- /providers/postiz/integrations (raw passthrough) ----
  if (req.path === '/providers/postiz/integrations' && req.method === 'GET') {
    const postizCfg = getPostizConfig(req);
    if (!postizCfg) return apiError(400, 'NO_POSTIZ', 'Postiz API key not configured');
    try {
      const res = await postizFetch(postizCfg, '/integrations');
      const data = await res.json();
      return { status: res.status, data };
    } catch (error: any) {
      return apiError(502, 'POSTIZ_UNREACHABLE', error?.message || 'Cannot reach Postiz');
    }
  }

  // ---- /publish (post via Postiz) ----
  if (req.path === '/publish' && req.method === 'POST') {
    const postizCfg = getPostizConfig(req);
    if (!postizCfg) return apiError(400, 'NO_POSTIZ', 'Postiz API key not configured');
    const body = (req.body || {}) as PublishRequest;
    if (!body.content || !body.integrationIds?.length) {
      return apiError(400, 'VALIDATION_ERROR', 'content and integrationIds are required');
    }
    try {
      return await postizPublish(postizCfg, body);
    } catch (error: any) {
      return apiError(502, 'POSTIZ_ERROR', error?.message || 'Publish failed');
    }
  }

  // ---- /posts (local drafts) ----
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

  return apiError(501, 'NOT_IMPLEMENTED', `No handler for ${req.method} ${req.path}`);
}
