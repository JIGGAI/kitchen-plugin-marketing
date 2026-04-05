import { Request, Response } from 'express';
import { eq, desc, and, like, gte, lte, sql } from 'drizzle-orm';
import { initializeDatabase, encryptCredentials, decryptCredentials } from '../db';
import * as schema from '../db/schema';
import {
  PostCreateRequest,
  PostUpdateRequest,
  PostResponse,
  MediaUploadRequest,
  MediaResponse,
  TemplateCreateRequest,
  TemplateResponse,
  SocialAccountCreateRequest,
  SocialAccountResponse,
  AnalyticsOverviewResponse,
  EngagementAnalyticsResponse,
  CalendarResponse,
  WebhookCreateRequest,
  WebhookResponse,
  PaginatedResponse,
  ApiError
} from '../types';
import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// File upload configuration
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Helper functions
function getTeamId(req: Request): string {
  return req.headers['x-team-id'] as string || req.query.teamId as string;
}

function getUserId(req: Request): string {
  return req.headers['x-user-id'] as string || 'system';
}

function sendError(res: Response, status: number, error: string, message: string, details?: any) {
  const response: ApiError = { error, message, details };
  res.status(status).json(response);
}

function parsePagination(req: Request) {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  return { limit, offset };
}

// Main router function
export default function createRoutes(app: any) {
  
  // ===== POSTS ENDPOINTS =====
  
  // GET /posts - List posts with filtering and pagination
  app.get('/posts', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const { limit, offset } = parsePagination(req);
      
      // Build filters
      const conditions = [eq(schema.posts.teamId, teamId)];
      
      if (req.query.status) {
        conditions.push(eq(schema.posts.status, req.query.status as string));
      }
      
      if (req.query.platform) {
        conditions.push(like(schema.posts.platforms, `%"${req.query.platform}"%`));
      }
      
      if (req.query.tag) {
        conditions.push(like(schema.posts.tags, `%"${req.query.tag}"%`));
      }
      
      // Get total count
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.posts)
        .where(and(...conditions));
      const total = totalResult[0].count;
      
      // Get posts with pagination
      const posts = await db
        .select()
        .from(schema.posts)
        .where(and(...conditions))
        .orderBy(desc(schema.posts.createdAt))
        .limit(limit)
        .offset(offset);
      
      // Transform to response format
      const transformedPosts: PostResponse[] = posts.map(post => ({
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
      
      const response: PaginatedResponse<PostResponse> = {
        data: transformedPosts,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /posts - Create new post
  app.post('/posts', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      const userId = getUserId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const body: PostCreateRequest = req.body;
      
      if (!body.content || !body.platforms?.length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Content and platforms are required');
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
      
      // Return created post
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
      
      res.status(201).json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // GET /posts/:id - Get specific post
  app.get('/posts/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const post = await db
        .select()
        .from(schema.posts)
        .where(and(
          eq(schema.posts.id, req.params.id),
          eq(schema.posts.teamId, teamId)
        ))
        .get();
      
      if (!post) {
        return sendError(res, 404, 'POST_NOT_FOUND', 'Post not found');
      }
      
      // Get metrics for this post
      const metrics = await db
        .select()
        .from(schema.postMetrics)
        .where(eq(schema.postMetrics.postId, post.id));
      
      const platformMetrics: any = {};
      metrics.forEach(metric => {
        platformMetrics[metric.platform] = {
          impressions: metric.impressions || 0,
          likes: metric.likes || 0,
          shares: metric.shares || 0,
          comments: metric.comments || 0,
          clicks: metric.clicks || 0,
          engagementRate: parseFloat(metric.engagementRate || '0'),
        };
      });
      
      const response: PostResponse = {
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
        metrics: Object.keys(platformMetrics).length > 0 ? platformMetrics : undefined,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // PUT /posts/:id - Update post
  app.put('/posts/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const body: PostUpdateRequest = req.body;
      
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      
      if (body.content !== undefined) updateData.content = body.content;
      if (body.platforms !== undefined) updateData.platforms = JSON.stringify(body.platforms);
      if (body.status !== undefined) updateData.status = body.status;
      if (body.scheduledAt !== undefined) updateData.scheduledAt = body.scheduledAt;
      if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);
      if (body.mediaIds !== undefined) updateData.mediaIds = JSON.stringify(body.mediaIds);
      
      const result = await db
        .update(schema.posts)
        .set(updateData)
        .where(and(
          eq(schema.posts.id, req.params.id),
          eq(schema.posts.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'POST_NOT_FOUND', 'Post not found');
      }
      
      // Return updated post
      const updatedPost = await db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.id, req.params.id))
        .get();
      
      const response: PostResponse = {
        id: updatedPost!.id,
        content: updatedPost!.content,
        platforms: JSON.parse(updatedPost!.platforms || '[]'),
        status: updatedPost!.status as any,
        scheduledAt: updatedPost!.scheduledAt || undefined,
        publishedAt: updatedPost!.publishedAt || undefined,
        tags: JSON.parse(updatedPost!.tags || '[]'),
        mediaIds: JSON.parse(updatedPost!.mediaIds || '[]'),
        templateId: updatedPost!.templateId || undefined,
        createdAt: updatedPost!.createdAt,
        updatedAt: updatedPost!.updatedAt,
        createdBy: updatedPost!.createdBy,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // DELETE /posts/:id - Delete post
  app.delete('/posts/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const result = await db
        .delete(schema.posts)
        .where(and(
          eq(schema.posts.id, req.params.id),
          eq(schema.posts.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'POST_NOT_FOUND', 'Post not found');
      }
      
      // Also delete metrics
      await db
        .delete(schema.postMetrics)
        .where(eq(schema.postMetrics.postId, req.params.id));
      
      res.status(204).send();
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /posts/:id/publish - Publish post immediately
  app.post('/posts/:id/publish', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const { platforms } = req.body;
      
      const now = new Date().toISOString();
      const updateData: any = {
        status: 'published',
        publishedAt: now,
        updatedAt: now,
      };
      
      if (platforms) {
        updateData.platforms = JSON.stringify(platforms);
      }
      
      const result = await db
        .update(schema.posts)
        .set(updateData)
        .where(and(
          eq(schema.posts.id, req.params.id),
          eq(schema.posts.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'POST_NOT_FOUND', 'Post not found');
      }
      
      // TODO: Trigger actual publishing to social platforms
      // This would integrate with social media APIs
      
      res.json({ success: true, publishedAt: now });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // ===== MEDIA ENDPOINTS =====
  
  // GET /media - List media assets
  app.get('/media', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const { limit, offset } = parsePagination(req);
      
      const conditions = [eq(schema.media.teamId, teamId)];
      
      if (req.query.tag) {
        conditions.push(like(schema.media.tags, `%"${req.query.tag}"%`));
      }
      
      if (req.query.type) {
        conditions.push(like(schema.media.mimeType, `${req.query.type}%`));
      }
      
      const media = await db
        .select()
        .from(schema.media)
        .where(and(...conditions))
        .orderBy(desc(schema.media.createdAt))
        .limit(limit)
        .offset(offset);
      
      const response: MediaResponse[] = media.map(item => ({
        id: item.id,
        filename: item.filename,
        originalName: item.originalName,
        mimeType: item.mimeType,
        size: item.size,
        width: item.width || undefined,
        height: item.height || undefined,
        alt: item.alt || undefined,
        tags: JSON.parse(item.tags || '[]'),
        url: item.url,
        thumbnailUrl: item.thumbnailUrl || undefined,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
      }));
      
      res.json({ media: response });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /media - Upload media asset
  app.post('/media', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      const userId = getUserId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      if (!req.file) {
        return sendError(res, 400, 'NO_FILE', 'File is required');
      }
      
      const { db } = initializeDatabase(teamId);
      const body: MediaUploadRequest = req.body;
      
      const mediaId = randomUUID();
      const filename = `${mediaId}${path.extname(req.file.originalname)}`;
      const mediaDir = `./uploads/media/${teamId}`;
      
      // Ensure directory exists
      await fs.mkdir(mediaDir, { recursive: true });
      
      // Move file to permanent location
      const finalPath = path.join(mediaDir, filename);
      await fs.rename(req.file.path, finalPath);
      
      const newMedia = {
        id: mediaId,
        teamId,
        filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        width: null, // TODO: Extract dimensions for images
        height: null,
        alt: body.alt || null,
        tags: JSON.stringify(body.tags || []),
        url: `/api/plugins/kitchen-plugin-marketing/media/${mediaId}/file`,
        thumbnailUrl: null, // TODO: Generate thumbnails
        createdAt: new Date().toISOString(),
        createdBy: userId,
      };
      
      await db.insert(schema.media).values(newMedia);
      
      const response: MediaResponse = {
        id: newMedia.id,
        filename: newMedia.filename,
        originalName: newMedia.originalName,
        mimeType: newMedia.mimeType,
        size: newMedia.size,
        alt: newMedia.alt || undefined,
        tags: JSON.parse(newMedia.tags),
        url: newMedia.url,
        createdAt: newMedia.createdAt,
        createdBy: newMedia.createdBy,
      };
      
      res.status(201).json(response);
    } catch (error: any) {
      sendError(res, 500, 'UPLOAD_ERROR', error.message);
    }
  });
  
  // GET /media/:id/file - Serve media file
  app.get('/media/:id/file', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const media = await db
        .select()
        .from(schema.media)
        .where(and(
          eq(schema.media.id, req.params.id),
          eq(schema.media.teamId, teamId)
        ))
        .get();
      
      if (!media) {
        return sendError(res, 404, 'MEDIA_NOT_FOUND', 'Media not found');
      }
      
      const filePath = `./uploads/media/${teamId}/${media.filename}`;
      res.set('Content-Type', media.mimeType);
      res.sendFile(path.resolve(filePath));
    } catch (error: any) {
      sendError(res, 500, 'FILE_ERROR', error.message);
    }
  });
  
  // ===== ANALYTICS ENDPOINTS =====
  
  // GET /analytics/overview - Get overview metrics
  app.get('/analytics/overview', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const period = req.query.period as string || '30d';
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      const days = parseInt(period.replace('d', '')) || 30;
      startDate.setDate(endDate.getDate() - days);
      
      // Get post metrics in date range
      const metrics = await db
        .select({
          platform: schema.postMetrics.platform,
          totalImpressions: sql<number>`sum(${schema.postMetrics.impressions})`,
          totalLikes: sql<number>`sum(${schema.postMetrics.likes})`,
          totalShares: sql<number>`sum(${schema.postMetrics.shares})`,
          totalComments: sql<number>`sum(${schema.postMetrics.comments})`,
          totalClicks: sql<number>`sum(${schema.postMetrics.clicks})`,
          postCount: sql<number>`count(distinct ${schema.postMetrics.postId})`,
        })
        .from(schema.postMetrics)
        .innerJoin(schema.posts, eq(schema.posts.id, schema.postMetrics.postId))
        .where(and(
          eq(schema.posts.teamId, teamId),
          gte(schema.posts.publishedAt, startDate.toISOString())
        ))
        .groupBy(schema.postMetrics.platform);
      
      // Aggregate totals
      let totalPosts = 0;
      let totalImpressions = 0;
      let totalEngagements = 0;
      let totalClicks = 0;
      const platformBreakdown: any = {};
      
      metrics.forEach(metric => {
        const engagements = (metric.totalLikes || 0) + (metric.totalShares || 0) + (metric.totalComments || 0);
        
        totalPosts += metric.postCount || 0;
        totalImpressions += metric.totalImpressions || 0;
        totalEngagements += engagements;
        totalClicks += metric.totalClicks || 0;
        
        platformBreakdown[metric.platform] = {
          posts: metric.postCount || 0,
          impressions: metric.totalImpressions || 0,
          engagements: engagements,
        };
      });
      
      const response: AnalyticsOverviewResponse = {
        period,
        metrics: {
          totalPosts,
          totalImpressions,
          totalEngagements,
          totalClicks,
          engagementRate: totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0,
          averageImpressions: totalPosts > 0 ? totalImpressions / totalPosts : 0,
        },
        platformBreakdown,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // Import additional route modules
  const { registerTemplateRoutes } = require('./templates');
  const { registerSocialAccountRoutes } = require('./social-accounts');
  const { registerCalendarRoutes } = require('./calendar');
  const { registerWebhookRoutes } = require('./webhooks');
  
  // Register all route modules
  registerTemplateRoutes(app);
  registerSocialAccountRoutes(app);
  registerCalendarRoutes(app);
  registerWebhookRoutes(app);
  
  console.log('Marketing plugin API routes registered');
}