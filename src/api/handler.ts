import { and, desc, eq, like, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';
import type { KitchenPluginContext } from './types-kitchen';
import { initializeDatabase, encryptCredentials, decryptCredentials } from '../db';
import * as schema from '../db/schema';
import { createAllDrivers, createDriver, getPlatforms, type BackendSources, type PostContent } from '../drivers';
import { getPostizIntegrations } from '../drivers/postiz-backend';
import { startGenerationJob, getJob } from '../generation/runner';
import type { GenerationRequest } from '../generation/types';
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

async function getBackendSources(req: PluginRequest, teamId: string): Promise<BackendSources> {
  const sources: BackendSources = {};

  // Kitchen base URL for resolving local media paths during Postiz uploads.
  // Derive it from the request/proxy headers, not process env.
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost:7777';
  sources.kitchenBaseUrl = `${proto}://${host}`;

  // Postiz — check header first, then fall back to DB-stored config
  const postizKey = req.query.postizApiKey || req.headers['x-postiz-api-key'];
  if (postizKey) {
    const baseUrl = req.query.postizBaseUrl || req.headers['x-postiz-base-url'] || 'https://api.postiz.com/public/v1';
    sources.postiz = { apiKey: postizKey, baseUrl: baseUrl.replace(/\/+$/, '') };
  } else {
    // Fall back to DB-stored Postiz config (set via Accounts tab "Save & Detect")
    try {
      const { db } = initializeDatabase(teamId);
      const rows = db
        .select()
        .from(schema.pluginConfig)
        .where(and(eq(schema.pluginConfig.teamId, teamId), eq(schema.pluginConfig.key, 'postiz')))
        .all();
      if (rows.length > 0) {
        const parsed = JSON.parse(rows[0].value);
        if (parsed.apiKey) {
          sources.postiz = {
            apiKey: String(parsed.apiKey),
            baseUrl: String(parsed.baseUrl || 'https://api.postiz.com/public/v1').replace(/\/+$/, ''),
          };
        }
      }
    } catch { /* ignore DB read failures */ }
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

  // Pre-fetch Postiz integrations so createAllDrivers can create per-account drivers
  if (sources.postiz) {
    try {
      sources._postizIntegrations = await getPostizIntegrations(sources.postiz);
    } catch { /* ignore — drivers will fall back to lazy fetch */ }
  }

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
      const sources = await getBackendSources(req, teamId);
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
    const sources = await getBackendSources(req, teamId);
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
      integrationId?: string; // optional: target a specific Postiz integration
      settings?: Record<string, Record<string, unknown>>; // per-platform settings
    };

    if (!body?.content || !body?.platforms?.length) {
      return apiError(400, 'VALIDATION_ERROR', 'content and platforms[] are required');
    }

    const sources = await getBackendSources(req, teamId);
    const results: Array<{ platform: string; success: boolean; postId?: string; error?: string; backend?: string; integrationId?: string }> = [];

    for (const platform of body.platforms) {
      // If caller pinned an integrationId, create a driver that targets it directly
      let driverConfig: import('../drivers').DriverConfig = {
        postiz: sources.postiz
          ? {
              apiKey: sources.postiz.apiKey,
              baseUrl: sources.postiz.baseUrl,
              integrationId: body.integrationId || undefined,
            }
          : undefined,
        gateway: sources.gatewayChannels?.includes(platform) ? { channel: platform } : undefined,
        direct: sources.storedAccounts?.find((a) => a.platform === platform)?.credentials as any,
      };
      const driver = createDriver(platform, driverConfig);

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
        integrationId: status.integrationId,
      });
    }

    const allOk = results.every((r) => r.success);
    return { status: allOk ? 201 : 207, data: { results } };
  }

  // ---- /platforms (list available platforms) ----
  if (req.path === '/platforms' && req.method === 'GET') {
    const sources = await getBackendSources(req, teamId);
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
      const sources = await getBackendSources(req, teamId);
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
      if ((body as any).mediaIds !== undefined) updates.mediaIds = JSON.stringify((body as any).mediaIds);
      await db.update(schema.posts).set(updates).where(eq(schema.posts.id, singlePostMatch[1]));
      return { status: 200, data: { updated: true, id: singlePostMatch[1] } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Unknown error');
    }
  }

  // ---- /media (upload, list, serve, delete) ----
  const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');

  function ensureMediaDir(team: string) {
    const dir = join(MEDIA_DIR, team);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // POST /media — upload (base64 in JSON body)
  if (req.path === '/media' && req.method === 'POST') {
    try {
      const body = req.body as {
        data?: string; // base64 (optionally with data: prefix)
        sourceUrl?: string; // server-side fetch
        filename?: string;
        mimeType?: string;
        alt?: string;
        tags?: string[];
      };

      if (!body?.data && !body?.sourceUrl) {
        return apiError(400, 'VALIDATION_ERROR', 'data (base64) or sourceUrl is required');
      }

      let buf: Buffer;
      let detectedMime = body.mimeType || 'application/octet-stream';
      let originalName = body.filename;

      if (body.sourceUrl && !body.data) {
        // Server-side download (useful for workflows/automation):
        // avoids having to base64-encode large files client-side.
        const res = await fetch(body.sourceUrl);
        if (!res.ok) {
          return apiError(400, 'VALIDATION_ERROR', `Failed to fetch sourceUrl (${res.status})`);
        }
        const ct = res.headers.get('content-type');
        if (ct) detectedMime = ct.split(';')[0].trim();
        const u = new URL(body.sourceUrl);
        const leaf = u.pathname.split('/').filter(Boolean).pop();
        if (!originalName && leaf) originalName = leaf;
        const ab = await res.arrayBuffer();
        buf = Buffer.from(ab);

        // Safety cap (25MB)
        if (buf.length > 25 * 1024 * 1024) {
          return apiError(400, 'VALIDATION_ERROR', 'Media too large (max 25MB)');
        }
      } else {
        // Base64 upload
        let base64 = String(body.data || '');
        const dataUrlMatch = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
          detectedMime = dataUrlMatch[1];
          base64 = dataUrlMatch[2];
        }
        buf = Buffer.from(base64, 'base64');
      }
      const id = randomUUID();
      const ext = extname(originalName || '') || mimeToExt(detectedMime);
      const storedFilename = `${id}${ext}`;
      const dir = ensureMediaDir(teamId);
      const filePath = join(dir, storedFilename);
      writeFileSync(filePath, buf);

      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();
      const userId = getUserId(req);

      const record = {
        id,
        teamId,
        filename: storedFilename,
        originalName: originalName || storedFilename,
        mimeType: detectedMime,
        size: buf.length,
        width: null as number | null,
        height: null as number | null,
        alt: body.alt || null,
        tags: JSON.stringify(body.tags || []),
        url: `/api/plugins/marketing/media/${id}/file?team=${encodeURIComponent(teamId)}`,
        thumbnailUrl: null as string | null,
        createdAt: now,
        createdBy: userId,
      };

      await db.insert(schema.media).values(record);

      return {
        status: 201,
        data: {
          id,
          filename: record.originalName,
          mimeType: detectedMime,
          size: buf.length,
          url: record.url,
          alt: record.alt,
          tags: body.tags || [],
          createdAt: now,
        },
      };
    } catch (error: any) {
      return apiError(500, 'UPLOAD_ERROR', error?.message || 'Upload failed');
    }
  }

  // GET /media — list media assets
  if (req.path === '/media' && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const { limit, offset } = parsePagination(req.query);

      const conditions = [eq(schema.media.teamId, teamId)];
      if (req.query.mimeType) {
        conditions.push(like(schema.media.mimeType, `${req.query.mimeType}%`));
      }

      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.media)
        .where(and(...conditions));
      const total = totalResult[0]?.count ?? 0;

      const items = await db
        .select()
        .from(schema.media)
        .where(and(...conditions))
        .orderBy(desc(schema.media.createdAt))
        .limit(limit)
        .offset(offset);

      // For listing, include a small data URL thumbnail for images (and videos with stored thumbnails)
      const data = items.map((m) => {
        let thumbnailDataUrl: string | undefined;
        if (m.mimeType.startsWith('image/')) {
          const fp = join(MEDIA_DIR, teamId, m.filename);
          if (existsSync(fp)) {
            const raw = readFileSync(fp);
            // Only inline if under 2MB to keep responses reasonable
            if (raw.length < 2 * 1024 * 1024) {
              thumbnailDataUrl = `data:${m.mimeType};base64,${raw.toString('base64')}`;
            }
          }
        } else if (m.thumbnailUrl?.startsWith('data:')) {
          // Video with a stored thumbnail data URL (extracted during generation)
          thumbnailDataUrl = m.thumbnailUrl;
        }
        return {
          id: m.id,
          filename: m.originalName,
          mimeType: m.mimeType,
          size: m.size,
          url: m.url,
          thumbnailDataUrl,
          alt: m.alt,
          tags: JSON.parse(m.tags || '[]'),
          createdAt: m.createdAt,
        };
      });

      return {
        status: 200,
        data: { data, total, offset, limit, hasMore: offset + limit < total },
      };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to list media');
    }
  }

  // GET /media/:id — single media item (metadata + data URL)
  const mediaIdMatch = req.path.match(/^\/media\/([a-f0-9-]+)$/);
  if (mediaIdMatch && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const [item] = await db
        .select()
        .from(schema.media)
        .where(and(eq(schema.media.id, mediaIdMatch[1]), eq(schema.media.teamId, teamId)));
      if (!item) return apiError(404, 'NOT_FOUND', 'Media not found');

      let dataUrl: string | undefined;
      const fp = join(MEDIA_DIR, teamId, item.filename);
      if (existsSync(fp)) {
        const raw = readFileSync(fp);
        dataUrl = `data:${item.mimeType};base64,${raw.toString('base64')}`;
      }

      return {
        status: 200,
        data: {
          id: item.id,
          filename: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          url: item.url,
          dataUrl,
          alt: item.alt,
          tags: JSON.parse(item.tags || '[]'),
          createdAt: item.createdAt,
        },
      };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to get media');
    }
  }

  // GET /media/:id/file — serve raw file as base64 data URL (workaround for JSON-only proxy)
  const mediaFileMatch = req.path.match(/^\/media\/([a-f0-9-]+)\/file$/);
  if (mediaFileMatch && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const [item] = await db
        .select()
        .from(schema.media)
        .where(and(eq(schema.media.id, mediaFileMatch[1]), eq(schema.media.teamId, teamId)));
      if (!item) return apiError(404, 'NOT_FOUND', 'Media not found');

      const fp = join(MEDIA_DIR, teamId, item.filename);
      if (!existsSync(fp)) return apiError(404, 'NOT_FOUND', 'File missing from disk');

      const raw = readFileSync(fp);
      const dataUrl = `data:${item.mimeType};base64,${raw.toString('base64')}`;
      return { status: 200, data: { dataUrl, mimeType: item.mimeType, filename: item.originalName } };
    } catch (error: any) {
      return apiError(500, 'FILE_ERROR', error?.message || 'Failed to serve file');
    }
  }

  // DELETE /media/:id
  if (mediaIdMatch && req.method === 'DELETE') {
    try {
      const { db } = initializeDatabase(teamId);
      const [item] = await db
        .select()
        .from(schema.media)
        .where(and(eq(schema.media.id, mediaIdMatch[1]), eq(schema.media.teamId, teamId)));
      if (!item) return apiError(404, 'NOT_FOUND', 'Media not found');

      // Remove file from disk
      const fp = join(MEDIA_DIR, teamId, item.filename);
      try { unlinkSync(fp); } catch { /* ok if already gone */ }

      await db.delete(schema.media).where(eq(schema.media.id, mediaIdMatch[1]));
      return { status: 200, data: { deleted: true, id: mediaIdMatch[1] } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to delete media');
    }
  }

  // ---- /config (per-team plugin config — e.g. Postiz API key) ----
  if (req.path === '/config' && req.method === 'GET') {
    try {
      const { db } = initializeDatabase(teamId);
      const rows = db
        .select()
        .from(schema.pluginConfig)
        .where(eq(schema.pluginConfig.teamId, teamId))
        .all();
      const config: Record<string, unknown> = {};
      for (const row of rows) {
        try { config[row.key] = JSON.parse(row.value); } catch { config[row.key] = row.value; }
      }
      return { status: 200, data: { config } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to read config');
    }
  }

  if (req.path === '/config' && req.method === 'POST') {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();

      for (const [key, value] of Object.entries(body)) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        // Upsert: try insert, on conflict update
        try {
          db.run(
            sql`INSERT INTO plugin_config (team_id, key, value, updated_at) VALUES (${teamId}, ${key}, ${valueStr}, ${now}) ON CONFLICT(team_id, key) DO UPDATE SET value = ${valueStr}, updated_at = ${now}`
          );
        } catch {
          // Fallback for older SQLite without ON CONFLICT
          const existing = db
            .select()
            .from(schema.pluginConfig)
            .where(and(eq(schema.pluginConfig.teamId, teamId), eq(schema.pluginConfig.key, key)))
            .all();
          if (existing.length > 0) {
            db.update(schema.pluginConfig)
              .set({ value: valueStr, updatedAt: now })
              .where(and(eq(schema.pluginConfig.teamId, teamId), eq(schema.pluginConfig.key, key)))
              .run();
          } else {
            db.insert(schema.pluginConfig)
              .values({ teamId, key, value: valueStr, updatedAt: now })
              .run();
          }
        }
      }

      return { status: 200, data: { ok: true, keys: Object.keys(body) } };
    } catch (error: any) {
      return apiError(500, 'DATABASE_ERROR', error?.message || 'Failed to save config');
    }
  }

  // ---- POST /media/:id/generate (start async generation job) ----
  const generateMatch = req.path.match(/^\/media\/([a-f0-9-]+)\/generate$/);
  if (generateMatch && req.method === 'POST') {
    try {
      const body = req.body as GenerationRequest | undefined;
      if (!body?.prompt || !body?.type) {
        return apiError(400, 'VALIDATION_ERROR', 'prompt and type (image|video) are required');
      }
      if (body.type !== 'image' && body.type !== 'video') {
        return apiError(400, 'VALIDATION_ERROR', 'type must be "image" or "video"');
      }
      const userId = getUserId(req);
      const job = startGenerationJob(teamId, generateMatch[1], body, userId);
      return { status: 202, data: { job } };
    } catch (error: any) {
      const status = error?.message?.includes('not found') ? 404 : 400;
      return apiError(status, 'GENERATION_ERROR', error?.message || 'Failed to start generation');
    }
  }

  // ---- GET /jobs/:id (poll generation job status) ----
  const jobMatch = req.path.match(/^\/jobs\/([a-f0-9-]+)$/);
  if (jobMatch && req.method === 'GET') {
    const job = getJob(teamId, jobMatch[1]);
    if (!job) return apiError(404, 'NOT_FOUND', 'Job not found');
    return { status: 200, data: { job } };
  }

  return apiError(501, 'NOT_IMPLEMENTED', `No handler for ${req.method} ${req.path}`);
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'image/svg+xml': '.svg',
    'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav',
  };
  return map[mime] || '';
}
