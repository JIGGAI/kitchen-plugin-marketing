import { Request, Response } from 'express';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import {
  PostResponse,
  CalendarResponse,
  ApiError
} from '../types';

// Helper functions
function getTeamId(req: Request): string {
  return req.headers['x-team-id'] as string || req.query.teamId as string;
}

function sendError(res: Response, status: number, error: string, message: string, details?: any) {
  const response: ApiError = { error, message, details };
  res.status(status).json(response);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function registerCalendarRoutes(app: any) {
  
  // GET /calendar - Get calendar view
  app.get('/calendar', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const start = req.query.start as string;
      const end = req.query.end as string;
      const view = req.query.view as 'day' | 'week' | 'month' || 'month';
      
      if (!start || !end) {
        return sendError(res, 400, 'MISSING_DATES', 'Start and end dates are required');
      }
      
      // Get scheduled posts in date range
      const posts = await db
        .select()
        .from(schema.posts)
        .where(and(
          eq(schema.posts.teamId, teamId),
          gte(schema.posts.scheduledAt, start),
          lte(schema.posts.scheduledAt, end),
          eq(schema.posts.status, 'scheduled')
        ))
        .orderBy(schema.posts.scheduledAt);
      
      // Group posts by date
      const eventsByDate: { [date: string]: PostResponse[] } = {};
      const platformCounts: { [platform: string]: number } = {};
      
      posts.forEach(post => {
        if (!post.scheduledAt) return;
        
        const date = formatDate(new Date(post.scheduledAt));
        
        if (!eventsByDate[date]) {
          eventsByDate[date] = [];
        }
        
        const postResponse: PostResponse = {
          id: post.id,
          content: post.content,
          platforms: JSON.parse(post.platforms || '[]'),
          status: post.status as any,
          scheduledAt: post.scheduledAt,
          publishedAt: post.publishedAt || undefined,
          tags: JSON.parse(post.tags || '[]'),
          mediaIds: JSON.parse(post.mediaIds || '[]'),
          templateId: post.templateId || undefined,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          createdBy: post.createdBy,
        };
        
        eventsByDate[date].push(postResponse);
        
        // Count platforms
        postResponse.platforms.forEach(platform => {
          platformCounts[platform] = (platformCounts[platform] || 0) + 1;
        });
      });
      
      // Convert to array format
      const events = Object.entries(eventsByDate).map(([date, posts]) => ({
        date,
        posts,
      }));
      
      const response: CalendarResponse = {
        view,
        period: `${start} to ${end}`,
        events,
        summary: {
          totalScheduled: posts.length,
          byPlatform: platformCounts,
        },
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /calendar/schedule - Schedule a post
  app.post('/calendar/schedule', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { postId, scheduledAt, platforms } = req.body;
      
      if (!postId || !scheduledAt) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'postId and scheduledAt are required');
      }
      
      const { db } = initializeDatabase(teamId);
      
      const updateData: any = {
        scheduledAt,
        status: 'scheduled',
        updatedAt: new Date().toISOString(),
      };
      
      if (platforms) {
        updateData.platforms = JSON.stringify(platforms);
      }
      
      const result = await db
        .update(schema.posts)
        .set(updateData)
        .where(and(
          eq(schema.posts.id, postId),
          eq(schema.posts.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'POST_NOT_FOUND', 'Post not found');
      }
      
      res.json({ success: true, scheduledAt });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // GET /calendar/scheduled - Get all scheduled posts
  app.get('/calendar/scheduled', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const posts = await db
        .select()
        .from(schema.posts)
        .where(and(
          eq(schema.posts.teamId, teamId),
          eq(schema.posts.status, 'scheduled')
        ))
        .orderBy(schema.posts.scheduledAt);
      
      const response: PostResponse[] = posts.map(post => ({
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
      
      res.json({ scheduled: response });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // PUT /calendar/scheduled/:id - Reschedule post
  app.put('/calendar/scheduled/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { scheduledAt, platforms } = req.body;
      
      if (!scheduledAt) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'scheduledAt is required');
      }
      
      const { db } = initializeDatabase(teamId);
      
      const updateData: any = {
        scheduledAt,
        updatedAt: new Date().toISOString(),
      };
      
      if (platforms) {
        updateData.platforms = JSON.stringify(platforms);
      }
      
      const result = await db
        .update(schema.posts)
        .set(updateData)
        .where(and(
          eq(schema.posts.id, req.params.id),
          eq(schema.posts.teamId, teamId),
          eq(schema.posts.status, 'scheduled')
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'SCHEDULED_POST_NOT_FOUND', 'Scheduled post not found');
      }
      
      res.json({ success: true, scheduledAt });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /calendar/bulk-schedule - Bulk schedule posts
  app.post('/calendar/bulk-schedule', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      const userId = req.headers['x-user-id'] as string || 'system';
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { posts } = req.body;
      
      if (!Array.isArray(posts) || posts.length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Posts array is required');
      }
      
      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();
      const createdPosts: PostResponse[] = [];
      
      // Create posts in batch
      for (const postData of posts) {
        if (!postData.content || !postData.scheduledAt || !postData.platforms?.length) {
          continue; // Skip invalid posts
        }
        
        const newPost = {
          id: require('crypto').randomUUID(),
          teamId,
          content: postData.content,
          platforms: JSON.stringify(postData.platforms),
          status: 'scheduled',
          scheduledAt: postData.scheduledAt,
          publishedAt: null,
          tags: JSON.stringify(postData.tags || []),
          mediaIds: JSON.stringify(postData.mediaIds || []),
          templateId: postData.templateId || null,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
        };
        
        await db.insert(schema.posts).values(newPost);
        
        createdPosts.push({
          id: newPost.id,
          content: newPost.content,
          platforms: JSON.parse(newPost.platforms),
          status: newPost.status as any,
          scheduledAt: newPost.scheduledAt || undefined,
          tags: JSON.parse(newPost.tags),
          mediaIds: JSON.parse(newPost.mediaIds),
          templateId: newPost.templateId || undefined,
          createdAt: newPost.createdAt,
          updatedAt: newPost.updatedAt,
          createdBy: newPost.createdBy,
        });
      }
      
      res.status(201).json({
        success: true,
        created: createdPosts.length,
        posts: createdPosts,
      });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
}