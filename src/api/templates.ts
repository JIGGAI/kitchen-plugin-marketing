import { Request, Response } from 'express';
import { eq, desc, and, like } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import {
  TemplateCreateRequest,
  TemplateResponse,
  PaginatedResponse,
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

function parsePagination(req: Request) {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  return { limit, offset };
}

export function registerTemplateRoutes(app: any) {
  
  // GET /templates - List templates
  app.get('/templates', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const { limit, offset } = parsePagination(req);
      
      const conditions = [eq(schema.templates.teamId, teamId)];
      
      if (req.query.tag) {
        conditions.push(like(schema.templates.tags, `%"${req.query.tag}"%`));
      }
      
      const templates = await db
        .select()
        .from(schema.templates)
        .where(and(...conditions))
        .orderBy(desc(schema.templates.createdAt))
        .limit(limit)
        .offset(offset);
      
      const response: TemplateResponse[] = templates.map(template => ({
        id: template.id,
        name: template.name,
        content: template.content,
        variables: JSON.parse(template.variables || '[]'),
        tags: JSON.parse(template.tags || '[]'),
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        createdBy: template.createdBy,
      }));
      
      res.json({ templates: response });
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // POST /templates - Create template
  app.post('/templates', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      const userId = getUserId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const body: TemplateCreateRequest = req.body;
      
      if (!body.name || !body.content) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Name and content are required');
      }
      
      const { db } = initializeDatabase(teamId);
      const now = new Date().toISOString();
      
      const newTemplate = {
        id: randomUUID(),
        teamId,
        name: body.name,
        content: body.content,
        variables: JSON.stringify(body.variables || []),
        tags: JSON.stringify(body.tags || []),
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      };
      
      await db.insert(schema.templates).values(newTemplate);
      
      const response: TemplateResponse = {
        id: newTemplate.id,
        name: newTemplate.name,
        content: newTemplate.content,
        variables: JSON.parse(newTemplate.variables),
        tags: JSON.parse(newTemplate.tags),
        createdAt: newTemplate.createdAt,
        updatedAt: newTemplate.updatedAt,
        createdBy: newTemplate.createdBy,
      };
      
      res.status(201).json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // GET /templates/:id - Get specific template
  app.get('/templates/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const template = await db
        .select()
        .from(schema.templates)
        .where(and(
          eq(schema.templates.id, req.params.id),
          eq(schema.templates.teamId, teamId)
        ))
        .get();
      
      if (!template) {
        return sendError(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
      }
      
      const response: TemplateResponse = {
        id: template.id,
        name: template.name,
        content: template.content,
        variables: JSON.parse(template.variables || '[]'),
        tags: JSON.parse(template.tags || '[]'),
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        createdBy: template.createdBy,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // PUT /templates/:id - Update template
  app.put('/templates/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      const body: Partial<TemplateCreateRequest> = req.body;
      
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      };
      
      if (body.name !== undefined) updateData.name = body.name;
      if (body.content !== undefined) updateData.content = body.content;
      if (body.variables !== undefined) updateData.variables = JSON.stringify(body.variables);
      if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);
      
      const result = await db
        .update(schema.templates)
        .set(updateData)
        .where(and(
          eq(schema.templates.id, req.params.id),
          eq(schema.templates.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
      }
      
      // Return updated template
      const updatedTemplate = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, req.params.id))
        .get();
      
      const response: TemplateResponse = {
        id: updatedTemplate!.id,
        name: updatedTemplate!.name,
        content: updatedTemplate!.content,
        variables: JSON.parse(updatedTemplate!.variables || '[]'),
        tags: JSON.parse(updatedTemplate!.tags || '[]'),
        createdAt: updatedTemplate!.createdAt,
        updatedAt: updatedTemplate!.updatedAt,
        createdBy: updatedTemplate!.createdBy,
      };
      
      res.json(response);
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
  
  // DELETE /templates/:id - Delete template
  app.delete('/templates/:id', async (req: Request, res: Response) => {
    try {
      const teamId = getTeamId(req);
      if (!teamId) return sendError(res, 400, 'MISSING_TEAM_ID', 'Team ID is required');
      
      const { db } = initializeDatabase(teamId);
      
      const result = await db
        .delete(schema.templates)
        .where(and(
          eq(schema.templates.id, req.params.id),
          eq(schema.templates.teamId, teamId)
        ));
      
      if (result.changes === 0) {
        return sendError(res, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
      }
      
      res.status(204).send();
    } catch (error: any) {
      sendError(res, 500, 'DATABASE_ERROR', error.message);
    }
  });
}