import { Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import {
  WebhookCreateRequest,
  WebhookResponse,
  ApiError
} from '../types';
import { randomUUID } from 'crypto';

// Helper functions
function getTeamId(req: Request): string {
  return req.headers['x-team-id'] as string || req.query.teamId as string;
}

function sendError(res: Response, status: number, error: string, message: string, details?: any) {
  const response: ApiError = { error, message, details };
  res.status(status).json(response);
}

export function registerWebhookRoutes(app: any) {
  
  // GET /webhooks - List webhooks
  app.get('/webhooks', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const webhooks = await db
        .select()
        .from(schema.webhooks)
        .where(eq(schema.webhooks.teamId, teamId))
        .orderBy(desc(schema.webhooks.createdAt));
      
      const response: WebhookResponse[] = webhooks.map(webhook => ({
        id: webhook.id,
        url: webhook.url,
        events: JSON.parse(webhook.events || '[]'),
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
        lastTriggered: webhook.lastTriggered || undefined,
      }));
      
      res.json({ webhooks: response });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /webhooks - Create webhook
  app.post('/webhooks', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const body: WebhookCreateRequest = req.body;
      
      if (!body.url || !body.events?.length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'URL and events are required');
      }
      
      // Validate URL
      try {
        new URL(body.url);
      } catch {
        return sendError(res, 400, 'INVALID_URL', 'Invalid webhook URL');
      }
      
      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();
      
      const newWebhook = {
        id: randomUUID(),
        teamId,
        url: body.url,
        events: JSON.stringify(body.events),
        secret: body.secret || null,
        isActive: true,
        createdAt: now,
        lastTriggered: null,
      };
      
      await db.insert(schema.webhooks).values(newWebhook);
      
      const response: WebhookResponse = {
        id: newWebhook.id,
        url: newWebhook.url,
        events: JSON.parse(newWebhook.events),
        isActive: newWebhook.isActive,
        createdAt: newWebhook.createdAt,
      };
      
      res.status(201).json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // GET /webhooks/:id - Get specific webhook
  app.get('/webhooks/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const webhook = await db
        .select()
        .from(schema.webhooks)
        .where(and(
          eq(schema.webhooks.id, req.params.id),
          eq(schema.webhooks.teamId, teamId)
        ))
        .get();
      
      if (!webhook) {
        return sendError(res, 404, 'WEBHOOK_NOT_FOUND', 'Webhook not found');
      }
      
      const response: WebhookResponse = {
        id: webhook.id,
        url: webhook.url,
        events: JSON.parse(webhook.events || '[]'),
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
        lastTriggered: webhook.lastTriggered || undefined,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // PUT /webhooks/:id - Update webhook
  app.put('/webhooks/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const body = req.body;
      
      const updateData: any = {};
      
      if (body.url !== undefined) {
        try {
          new URL(body.url);
          updateData.url = body.url;
        } catch {
          return sendError(res, 400, 'INVALID_URL', 'Invalid webhook URL');
        }
      }
      
      if (body.events !== undefined) updateData.events = JSON.stringify(body.events);
      if (body.secret !== undefined) updateData.secret = body.secret;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
      
      const result = await db
        .update(schema.webhooks)
        .set(updateData)
        .where(and(
          eq(schema.webhooks.id, req.params.id),
          eq(schema.webhooks.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'WEBHOOK_NOT_FOUND', 'Webhook not found');
      }
      
      res.json({ success: true });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // DELETE /webhooks/:id - Delete webhook
  app.delete('/webhooks/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const result = await db
        .delete(schema.webhooks)
        .where(and(
          eq(schema.webhooks.id, req.params.id),
          eq(schema.webhooks.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'WEBHOOK_NOT_FOUND', 'Webhook not found');
      }
      
      res.status(204).send();
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /webhooks/test - Test webhook delivery
  app.post('/webhooks/test', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { webhookId, event, data } = req.body;
      
      if (!webhookId || !event) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'webhookId and event are required');
      }
      
      const { db } = initializeDatabase(teamId);
      
      const webhook = await db
        .select()
        .from(schema.webhooks)
        .where(and(
          eq(schema.webhooks.id, webhookId),
          eq(schema.webhooks.teamId, teamId),
          eq(schema.webhooks.isActive, true)
        ))
        .get();
      
      if (!webhook) {
        return sendError(res, 404, 'WEBHOOK_NOT_FOUND', 'Active webhook not found');
      }
      
      const events = JSON.parse(webhook.events || '[]');\n      if (!events.includes(event)) {
        return sendError(res, 400, 'EVENT_NOT_SUBSCRIBED', 'Webhook not subscribed to this event');
      }
      
      // Test payload
      const payload = {\n        event,\n        timestamp: new Date().toISOString(),\n        teamId,\n        data: data || { test: true },\n      };\n      \n      try {\n        // Make actual HTTP request to webhook URL\n        const fetch = require('node-fetch');\n        const response = await fetch(webhook.url, {\n          method: 'POST',\n          headers: {\n            'Content-Type': 'application/json',\n            'User-Agent': 'KitchenPlugin-Marketing/1.0',\n            ...(webhook.secret && {\n              'X-Webhook-Signature': require('crypto')\n                .createHmac('sha256', webhook.secret)\n                .update(JSON.stringify(payload))\n                .digest('hex')\n            })\n          },\n          body: JSON.stringify(payload),\n          timeout: 10000,\n        });\n        \n        const responseText = await response.text();\n        \n        // Update last triggered time\n        await db\n          .update(schema.webhooks)\n          .set({ lastTriggered: new Date().toISOString() })\n          .where(eq(schema.webhooks.id, webhookId));\n        \n        res.json({\n          success: response.ok,\n          status: response.status,\n          response: responseText,\n          url: webhook.url,\n        });\n      } catch (error: any) {\n        res.json({\n          success: false,\n          error: error.message,\n          url: webhook.url,\n        });\n      }\n    } catch (error: any) {\n      sendError(res, 500, 'WEBHOOK_TEST_ERROR', error.message);\n    }\n  });\n}