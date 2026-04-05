import { Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { initializeDatabase, encryptCredentials, decryptCredentials } from '../db';
import * as schema from '../db/schema';
import {
  SocialAccountCreateRequest,
  SocialAccountResponse,
  ApiError
} from '../types';
import { randomUUID } from 'crypto';

// Helper functions (same as main routes)
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

export function registerSocialAccountRoutes(app: any) {
  
  // GET /accounts - List connected social accounts
  app.get('/accounts', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const accounts = await db
        .select()
        .from(schema.socialAccounts)
        .where(eq(schema.socialAccounts.teamId, teamId))
        .orderBy(desc(schema.socialAccounts.createdAt));
      
      const response: SocialAccountResponse[] = accounts.map(account => ({
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
        // Note: credentials are never returned for security
      }));
      
      res.json({ accounts: response });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /accounts - Connect new social account
  app.post('/accounts', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      const userId = getUserId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const body: SocialAccountCreateRequest = req.body;
      
      if (!body.platform || !body.displayName || !body.credentials) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Platform, displayName, and credentials are required');
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
        credentials: encryptCredentials(body.credentials),
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
      
      res.status(201).json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // GET /accounts/:id - Get specific account
  app.get('/accounts/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const account = await db
        .select()
        .from(schema.socialAccounts)
        .where(and(
          eq(schema.socialAccounts.id, req.params.id),
          eq(schema.socialAccounts.teamId, teamId)
        ))
        .get();
      
      if (!account) {
        return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Account not found');
      }
      
      const response: SocialAccountResponse = {
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
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // PUT /accounts/:id - Update account
  app.put('/accounts/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const body = req.body;
      
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      
      if (body.displayName !== undefined) updateData.displayName = body.displayName;
      if (body.username !== undefined) updateData.username = body.username;
      if (body.avatar !== undefined) updateData.avatar = body.avatar;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
      if (body.settings !== undefined) updateData.settings = JSON.stringify(body.settings);
      if (body.credentials !== undefined) updateData.credentials = encryptCredentials(body.credentials);
      
      const result = await db
        .update(schema.socialAccounts)
        .set(updateData)
        .where(and(
          eq(schema.socialAccounts.id, req.params.id),
          eq(schema.socialAccounts.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Account not found');
      }
      
      res.json({ success: true });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // DELETE /accounts/:id - Disconnect account
  app.delete('/accounts/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const result = await db
        .delete(schema.socialAccounts)
        .where(and(
          eq(schema.socialAccounts.id, req.params.id),
          eq(schema.socialAccounts.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Account not found');
      }
      
      // Also delete account metrics
      await db
        .delete(schema.accountMetrics)
        .where(eq(schema.accountMetrics.accountId, req.params.id));
      
      res.status(204).send();
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // GET /accounts/:id/metrics - Get account metrics
  app.get('/accounts/:id/metrics', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const period = req.query.period as string || '7d';
      
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      const days = parseInt(period.replace('d', '')) || 7;
      startDate.setDate(endDate.getDate() - days);
      
      const account = await db
        .select()
        .from(schema.socialAccounts)
        .where(and(
          eq(schema.socialAccounts.id, req.params.id),
          eq(schema.socialAccounts.teamId, teamId)
        ))
        .get();
      
      if (!account) {
        return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Account not found');
      }
      
      // Get metrics in date range
      const metrics = await db
        .select()
        .from(schema.accountMetrics)
        .where(and(
          eq(schema.accountMetrics.accountId, req.params.id),
          // Add date range filtering here when implemented
        ))
        .orderBy(desc(schema.accountMetrics.date))
        .limit(parseInt(period.replace('d', '')) || 7);
      
      // Calculate growth and totals
      const latestMetric = metrics[0];
      const oldestMetric = metrics[metrics.length - 1];
      
      const followerGrowth = latestMetric && oldestMetric 
        ? (latestMetric.followers || 0) - (oldestMetric.followers || 0)
        : 0;
      
      const totalEngagement = metrics.reduce((sum, m) => sum + (m.engagement || 0), 0);
      
      const response = {
        account: {
          id: account.id,
          platform: account.platform,
          username: account.username,
        },
        period,
        metrics: {
          followerGrowth,
          totalEngagement,
          averageEngagement: metrics.length > 0 ? totalEngagement / metrics.length : 0,
          currentFollowers: latestMetric?.followers || 0,
          currentFollowing: latestMetric?.following || 0,
        },
        dailyMetrics: metrics.map(m => ({
          date: m.date,
          followers: m.followers || 0,
          following: m.following || 0,
          posts: m.posts || 0,
          engagement: m.engagement || 0,
          reach: m.reach || 0,
        })),
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
}