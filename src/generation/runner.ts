import { randomUUID } from 'crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { homedir, tmpdir } from 'os';
import { eq, and } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import { generateImage, generateVideo } from './drivers';
import type { GenerationRequest, GenerationJobResponse } from './types';

const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};

function jobToResponse(row: schema.GenerationJob): GenerationJobResponse {
  return {
    id: row.id,
    sourceMediaId: row.sourceMediaId,
    type: row.type as 'image' | 'video',
    provider: row.provider,
    status: row.status as 'running' | 'completed' | 'failed',
    prompt: row.prompt,
    generatedMediaId: row.generatedMediaId || null,
    error: row.error || null,
    createdAt: row.createdAt,
    completedAt: row.completedAt || null,
  };
}

export function getJob(teamId: string, jobId: string): GenerationJobResponse | null {
  const { db } = initializeDatabase(teamId);
  const rows = db
    .select()
    .from(schema.generationJobs)
    .where(and(eq(schema.generationJobs.id, jobId), eq(schema.generationJobs.teamId, teamId)))
    .all();
  return rows.length ? jobToResponse(rows[0]) : null;
}

export function startGenerationJob(
  teamId: string,
  sourceMediaId: string,
  request: GenerationRequest,
  userId: string,
): GenerationJobResponse {
  const { db } = initializeDatabase(teamId);

  const mediaRows = db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.id, sourceMediaId), eq(schema.media.teamId, teamId)))
    .all();
  if (!mediaRows.length) throw new Error('Source media not found');
  const mediaItem = mediaRows[0];

  const sourcePath = join(MEDIA_DIR, teamId, mediaItem.filename);
  if (!existsSync(sourcePath)) throw new Error('Source media file missing from disk');

  if (!mediaItem.mimeType.startsWith('image/')) {
    throw new Error(`${request.type} generation requires an image source`);
  }

  const provider = request.provider || (request.type === 'image' ? 'gemini' : 'klingai');
  const jobId = randomUUID();
  const now = new Date().toISOString();

  const jobRecord: schema.NewGenerationJob = {
    id: jobId,
    teamId,
    sourceMediaId,
    type: request.type,
    provider,
    prompt: request.prompt,
    status: 'running',
    config: request.config ? JSON.stringify(request.config) : null,
    generatedMediaId: null,
    error: null,
    createdAt: now,
    completedAt: null,
  };

  db.insert(schema.generationJobs).values(jobRecord).run();

  runGeneration(teamId, jobId, sourcePath, mediaItem.originalName, request, userId)
    .catch(() => {});

  return jobToResponse(jobRecord as schema.GenerationJob);
}

async function runGeneration(
  teamId: string,
  jobId: string,
  sourcePath: string,
  sourceFilename: string,
  request: GenerationRequest,
  userId: string,
): Promise<void> {
  const { db } = initializeDatabase(teamId);
  const outputDir = join(tmpdir(), `mktg-gen-${jobId}`);

  try {
    const result = request.type === 'image'
      ? await generateImage(sourcePath, request.prompt, outputDir, request.config)
      : await generateVideo(sourcePath, request.prompt, outputDir, request.config);

    if (!existsSync(result.filePath)) {
      throw new Error(`Generated file not found at ${result.filePath}`);
    }

    const fileBuffer = readFileSync(result.filePath);
    const ext = extname(result.filePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const baseName = sourceFilename.replace(/\.[^.]+$/, '');
    const newMediaId = randomUUID();
    const storedFilename = `${newMediaId}${ext}`;
    const mediaDir = join(MEDIA_DIR, teamId);

    mkdirSync(mediaDir, { recursive: true });
    writeFileSync(join(mediaDir, storedFilename), fileBuffer);

    const now = new Date().toISOString();
    const tags = JSON.stringify([
      'ai-generated',
      request.type === 'video' ? 'video' : 'derived',
      `source:${request.provider || (request.type === 'image' ? 'gemini' : 'klingai')}`,
      `source-media:${sourceMediaId}`,
    ]);

    db.insert(schema.media).values({
      id: newMediaId,
      teamId,
      filename: storedFilename,
      originalName: `${baseName}-generated${ext}`,
      mimeType,
      size: fileBuffer.length,
      width: null,
      height: null,
      alt: null,
      tags,
      url: `/api/plugins/marketing/media/${newMediaId}/file?team=${encodeURIComponent(teamId)}`,
      thumbnailUrl: null,
      createdAt: now,
      createdBy: userId,
    }).run();

    db.update(schema.generationJobs)
      .set({
        status: 'completed',
        generatedMediaId: newMediaId,
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.generationJobs.id, jobId))
      .run();

  } catch (error: any) {
    db.update(schema.generationJobs)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.generationJobs.id, jobId))
      .run();
  }
}
