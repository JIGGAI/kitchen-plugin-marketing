import { randomUUID } from 'crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { homedir, tmpdir } from 'os';
import { execFile } from 'child_process';
import { eq, and } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import { generateImage, generateVideo } from './drivers';
import type { GenerationRequest, GenerationJobResponse } from './types';

const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');
const DEFAULT_COMPRESSION_QUALITY = 70; // 70% quality = ~30% size reduction

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};

function getCompressionQuality(teamId: string): number {
  try {
    const { db } = initializeDatabase(teamId);
    const rows = db
      .select()
      .from(schema.pluginConfig)
      .where(and(eq(schema.pluginConfig.teamId, teamId), eq(schema.pluginConfig.key, 'imageCompressionQuality')))
      .all();
    if (rows.length) {
      const val = parseInt(rows[0].value, 10);
      if (val >= 1 && val <= 100) return val;
    }
  } catch { /* use default */ }
  return DEFAULT_COMPRESSION_QUALITY;
}

function runFfmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { timeout: 30_000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function compressImage(inputPath: string, outputDir: string, quality: number): Promise<string> {
  const outputPath = join(outputDir, `compressed-${randomUUID()}.jpg`);
  await runFfmpeg([
    '-i', inputPath,
    '-q:v', String(Math.max(1, Math.round((100 - quality) / 3.3))), // ffmpeg JPEG q:v scale: 1=best, 31=worst
    '-y', outputPath,
  ]);
  if (!existsSync(outputPath)) {
    throw new Error('Image compression produced no output');
  }
  return outputPath;
}

async function extractVideoThumbnail(videoPath: string, outputDir: string): Promise<string> {
  const thumbPath = join(outputDir, `thumb-${randomUUID()}.jpg`);
  await runFfmpeg([
    '-i', videoPath,
    '-ss', '00:00:01',
    '-vframes', '1',
    '-q:v', '2',
    '-y', thumbPath,
  ]);
  if (!existsSync(thumbPath)) {
    // Fallback: try frame 0 if video is <1s
    await runFfmpeg([
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y', thumbPath,
    ]);
  }
  return existsSync(thumbPath) ? thumbPath : '';
}

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

  runGeneration(teamId, jobId, sourceMediaId, sourcePath, mediaItem.originalName, request, userId)
    .catch(() => {});

  return jobToResponse(jobRecord as schema.GenerationJob);
}

async function runGeneration(
  teamId: string,
  jobId: string,
  sourceMediaId: string,
  sourcePath: string,
  sourceFilename: string,
  request: GenerationRequest,
  userId: string,
): Promise<void> {
  const { db } = initializeDatabase(teamId);
  const outputDir = join(tmpdir(), `mktg-gen-${jobId}`);
  mkdirSync(outputDir, { recursive: true });

  try {
    const result = request.type === 'image'
      ? await generateImage(sourcePath, request.prompt, outputDir, request.config)
      : await generateVideo(sourcePath, request.prompt, outputDir, request.config);

    if (!existsSync(result.filePath)) {
      throw new Error(`Generated file not found at ${result.filePath}`);
    }

    const baseName = sourceFilename.replace(/\.[^.]+$/, '');
    // Count existing derivatives to increment the name
    const existingDerivatives = db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.teamId, teamId)))
      .all()
      .filter((m) => m.originalName?.startsWith(baseName + '-generated'));
    const version = existingDerivatives.length + 1;
    const versionSuffix = version === 1 ? '' : `-${version}`;
    const newMediaId = randomUUID();
    const mediaDir = join(MEDIA_DIR, teamId);
    mkdirSync(mediaDir, { recursive: true });

    let finalPath = result.filePath;
    let finalMime: string;
    let thumbnailUrl: string | null = null;

    if (request.type === 'image') {
      // Compress generated image
      const quality = getCompressionQuality(teamId);
      try {
        const compressedPath = await compressImage(result.filePath, outputDir, quality);
        const originalSize = statSync(result.filePath).size;
        const compressedSize = statSync(compressedPath).size;
        if (compressedSize < originalSize) {
          finalPath = compressedPath;
        }
      } catch {
        // Compression failed — use original file
      }
      finalMime = 'image/jpeg';
    } else {
      // Video: extract thumbnail
      finalMime = MIME_BY_EXT[extname(result.filePath).toLowerCase()] || 'video/mp4';
      try {
        const thumbPath = await extractVideoThumbnail(result.filePath, outputDir);
        if (thumbPath && existsSync(thumbPath)) {
          // Store thumbnail alongside the video
          const thumbId = `${newMediaId}-thumb`;
          const thumbFilename = `${thumbId}.jpg`;
          writeFileSync(join(mediaDir, thumbFilename), readFileSync(thumbPath));
          thumbnailUrl = `/api/plugins/marketing/media/${newMediaId}/file?team=${encodeURIComponent(teamId)}&thumb=1`;
          // Also store the thumbnail data as a separate record so it shows in the grid
          // No — just set thumbnailUrl on the video record so the list endpoint can inline it
          // The plugin's GET /media list checks for thumbnailDataUrl by reading the file at the stored filename
          // For videos we need to store the thumb bytes in the thumbnail_url field or alongside
          // Simplest: read the thumbnail as base64 data URL and store it in the thumbnail_url column
          const thumbBuffer = readFileSync(thumbPath);
          if (thumbBuffer.length < 2 * 1024 * 1024) {
            thumbnailUrl = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
          }
        }
      } catch {
        // Thumbnail extraction failed — video will show without preview
      }
    }

    const storedExt = request.type === 'image' ? '.jpg' : extname(result.filePath).toLowerCase();
    const storedFilename = `${newMediaId}${storedExt}`;
    const fileBuffer = readFileSync(finalPath);
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
      originalName: `${baseName}-generated${versionSuffix}${storedExt}`,
      mimeType: finalMime,
      size: fileBuffer.length,
      width: null,
      height: null,
      alt: null,
      tags,
      url: `/api/plugins/marketing/media/${newMediaId}/file?team=${encodeURIComponent(teamId)}`,
      thumbnailUrl,
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
