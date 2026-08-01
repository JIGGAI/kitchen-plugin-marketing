import { randomUUID } from 'crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { homedir, tmpdir } from 'os';
import { execFile } from 'child_process';
import { eq, and } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';
import { generateImage, generateVideo, generateImageFromPrompt, generateVideoFromPrompt } from './drivers';
import { applyBrandContext } from './brand-context';
import type { GenerationRequest, GenerationJobResponse } from './types';

const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');
const DEFAULT_COMPRESSION_QUALITY = 70; // 70% quality = ~30% size reduction
const DEFAULT_VIDEO_DURATION_SECONDS = 10;

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

// Per-team video duration default (seconds). Kling accepts 5 or 10 today;
// clamped to a sane range so a bad config value can't crash the driver.
function getVideoDuration(teamId: string): number {
  try {
    const { db } = initializeDatabase(teamId);
    const rows = db
      .select()
      .from(schema.pluginConfig)
      .where(and(eq(schema.pluginConfig.teamId, teamId), eq(schema.pluginConfig.key, 'videoDuration')))
      .all();
    if (rows.length) {
      const val = parseInt(rows[0].value, 10);
      if (val >= 1 && val <= 60) return val;
    }
  } catch { /* use default */ }
  return DEFAULT_VIDEO_DURATION_SECONDS;
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

// Provenance tags describe how an asset was made. They are not content, and
// must never be treated as vocabulary.
const PROVENANCE_TAGS = new Set([
  'derived', 'ai-generated', 'text-to-image', 'text-to-video', 'image-to-video',
  'video', 'image', 'pending-save', 'human', 'ai',
]);

/**
 * Content tags for a generated asset, taken from the prompt it was made from.
 *
 * Generated media used to carry only provenance — ai-generated, derived,
 * source:gemini — so nothing in the library could be found by what it shows.
 * The prompt already describes the picture, so no vision call is needed.
 *
 * The vocabulary is the team's OWN existing tags rather than a fixed list:
 * whatever words the base photos are tagged with, generated images are tagged
 * from the same set. That keeps the two consistent, needs no per-client
 * configuration, and degrades to nothing on a library that has no tags yet.
 * It also filters prompt boilerplate for free — words like "photo" or "room"
 * are not tags, so they cannot be picked up.
 */
function contentTagsFromPrompt(teamId: string, prompt: string): string[] {
  if (!prompt) return [];
  try {
    const { db } = initializeDatabase(teamId);
    const rows = db.select({ tags: schema.media.tags }).from(schema.media)
      .where(eq(schema.media.teamId, teamId)).all();
    const vocab = new Set<string>();
    for (const row of rows) {
      let parsed: unknown;
      try { parsed = JSON.parse(row.tags || '[]'); } catch { continue; }
      if (!Array.isArray(parsed)) continue;
      for (const raw of parsed) {
        const tag = String(raw).toLowerCase();
        if (!tag || PROVENANCE_TAGS.has(tag)) continue;
        if (tag.includes(':')) continue;            // source:gemini, source-media:<id>
        vocab.add(tag);
      }
    }
    if (!vocab.size) return [];
    const tokens = new Set(String(prompt).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
    const hits: string[] = [];
    for (const tag of vocab) {
      // Whole tag, or any hyphen-separated piece — matching how the base-photo
      // scorer reads tags, so both sides agree on what counts as a match.
      if (tokens.has(tag) || tag.split('-').some((piece) => piece.length >= 3 && tokens.has(piece))) {
        hits.push(tag);
      }
    }
    return hits.sort().slice(0, 8);
  } catch {
    return [];   // tagging is a nicety; never fail a generation over it
  }
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

export function startPromptGenerationJob(
  teamId: string,
  request: GenerationRequest & { filename?: string },
  userId: string,
): GenerationJobResponse {
  const { db } = initializeDatabase(teamId);

  if (request.type !== 'image' && request.type !== 'video') {
    throw new Error('type must be "image" or "video"');
  }

  const provider = request.provider || (request.type === 'video' ? 'klingai' : 'gemini');
  const jobId = randomUUID();
  const now = new Date().toISOString();

  const jobRecord: schema.NewGenerationJob = {
    id: jobId,
    teamId,
    sourceMediaId: 'prompt-only',
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

  const filename = request.filename || (request.type === 'video' ? 'generated-video' : 'generated-image');
  runPromptGeneration(teamId, jobId, filename, request, userId)
    .catch(() => {});

  return jobToResponse(jobRecord as schema.GenerationJob);
}

async function runPromptGeneration(
  teamId: string,
  jobId: string,
  filename: string,
  request: GenerationRequest,
  userId: string,
): Promise<void> {
  const { db } = initializeDatabase(teamId);
  const outputDir = join(tmpdir(), `mktg-gen-${jobId}`);
  mkdirSync(outputDir, { recursive: true });

  try {
    const videoConfig = request.type === 'video'
      ? { ...request.config, duration: request.config?.duration ?? getVideoDuration(teamId) }
      : request.config;

    // Prepend the brand visual preamble when the caller opted in. The DB
    // record still stores the raw user prompt so it reads cleanly in the
    // media modal — the brand context only augments what the driver sees.
    // 'fromScratch': there is no source photo, so the brand book's setting
    // description is the only thing telling the model what our shop is.
    const effectivePrompt = await applyBrandContext(request.prompt, request.includeBrand, teamId, request.brandVariant, 'fromScratch', request.type);
    const result = request.type === 'video'
      ? await generateVideoFromPrompt(effectivePrompt, outputDir, videoConfig)
      : await generateImageFromPrompt(effectivePrompt, outputDir, request.config);

    if (!existsSync(result.filePath)) {
      throw new Error(`Generated file not found at ${result.filePath}`);
    }

    const baseName = filename.replace(/\.[^.]+$/, '');
    const existingCount = db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.teamId, teamId)))
      .all()
      .filter((m) => m.originalName?.startsWith(baseName)).length;
    const versionSuffix = existingCount > 0 ? `-${existingCount + 1}` : '';

    const newMediaId = randomUUID();
    const mediaDir = join(MEDIA_DIR, teamId);
    mkdirSync(mediaDir, { recursive: true });

    let finalPath = result.filePath;
    let finalMime: string;
    let storedExt: string;
    let thumbnailUrl: string | null = null;
    let tags: string;

    if (request.type === 'video') {
      finalMime = MIME_BY_EXT[extname(result.filePath).toLowerCase()] || 'video/mp4';
      storedExt = extname(result.filePath).toLowerCase() || '.mp4';
      try {
        const thumbPath = await extractVideoThumbnail(result.filePath, outputDir);
        if (thumbPath && existsSync(thumbPath)) {
          const thumbBuffer = readFileSync(thumbPath);
          if (thumbBuffer.length < 2 * 1024 * 1024) {
            thumbnailUrl = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;
          }
        }
      } catch { /* video will show without preview */ }
      tags = JSON.stringify([
        'ai-generated',
        'text-to-video',
        `source:${request.provider || 'klingai'}`,
        'pending-save',
        ...contentTagsFromPrompt(teamId, request.prompt),
      ]);
    } else {
      const quality = getCompressionQuality(teamId);
      try {
        const compressedPath = await compressImage(result.filePath, outputDir, quality);
        if (statSync(compressedPath).size < statSync(result.filePath).size) {
          finalPath = compressedPath;
        }
      } catch { /* use original */ }
      finalMime = 'image/jpeg';
      storedExt = '.jpg';
      tags = JSON.stringify([
        'ai-generated',
        'text-to-image',
        `source:${request.provider || 'gemini'}`,
        'pending-save',
        ...contentTagsFromPrompt(teamId, request.prompt),
      ]);
    }

    const storedFilename = `${newMediaId}${storedExt}`;
    const fileBuffer = readFileSync(finalPath);
    writeFileSync(join(mediaDir, storedFilename), fileBuffer);

    const now = new Date().toISOString();

    db.insert(schema.media).values({
      id: newMediaId,
      teamId,
      filename: storedFilename,
      originalName: `${baseName}${versionSuffix}${storedExt}`,
      mimeType: finalMime,
      size: fileBuffer.length,
      width: null,
      height: null,
      alt: null,
      tags,
      url: `/api/plugins/marketing/media/${newMediaId}/file?team=${encodeURIComponent(teamId)}`,
      thumbnailUrl,
      prompt: request.prompt,
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
    // Merge per-team video defaults when the request didn't specify duration.
    const videoConfig = request.type === 'video'
      ? { ...request.config, duration: request.config?.duration ?? getVideoDuration(teamId) }
      : request.config;

    // Same brand-context augmentation as the prompt-only path; raw prompt
    // is preserved on the DB record. 'fromSource' drops the brand book's
    // setting description — this path edits a real shop photo, which already
    // supplies the room, and restating it fights the source image.
    const effectivePrompt = await applyBrandContext(request.prompt, request.includeBrand, teamId, request.brandVariant, 'fromSource', request.type);
    const result = request.type === 'image'
      ? await generateImage(sourcePath, effectivePrompt, outputDir, request.config)
      : await generateVideo(sourcePath, effectivePrompt, outputDir, videoConfig);

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
      'pending-save',
      `source-media:${sourceMediaId}`,
      ...contentTagsFromPrompt(teamId, request.prompt),
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
      prompt: request.prompt,
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
