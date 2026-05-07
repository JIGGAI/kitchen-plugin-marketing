import { existsSync, mkdirSync, statSync } from 'fs';
import { execFile } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { promisify } from 'util';

const pExecFile = promisify(execFile);

const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');
const THUMB_MAX_DIM = 400;
const THUMB_QUALITY = 80;

export function thumbDir(team: string): string {
  return join(MEDIA_DIR, team, 'thumbs');
}

export function thumbPath(team: string, mediaId: string): string {
  return join(thumbDir(team), `${mediaId}.jpg`);
}

export function originalPath(team: string, filename: string): string {
  return join(MEDIA_DIR, team, filename);
}

/**
 * Generate a thumbnail for an image at sourcePath, writing to destPath.
 * Uses macOS-built-in `sips`. Single 400px max-dim JPEG, quality 80.
 * Returns the destPath on success, throws on sips error.
 */
export async function generateThumb(sourcePath: string, destPath: string): Promise<string> {
  if (!existsSync(sourcePath)) {
    throw new Error(`thumbnail source missing: ${sourcePath}`);
  }
  const parent = dirname(destPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  // sips -Z scales the LONGEST side. Format jpeg + formatOptions sets quality.
  // -Z is non-destructive: smaller images are not upscaled.
  await pExecFile('sips', [
    '-Z', String(THUMB_MAX_DIM),
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', String(THUMB_QUALITY),
    sourcePath,
    '--out', destPath,
  ]);
  return destPath;
}

/**
 * Idempotent: returns the cached thumb path if present, otherwise generates
 * it from the original file. Throws if the source file is missing or sips
 * fails. Caller should treat thrown errors as "no thumb available" and let
 * the UI fall back gracefully.
 */
export async function ensureThumb(team: string, mediaId: string, originalFilename: string): Promise<string> {
  const dest = thumbPath(team, mediaId);
  if (existsSync(dest)) return dest;
  const src = originalPath(team, originalFilename);
  return generateThumb(src, dest);
}

/**
 * Returns thumb stat info for ETag/cache-control. Caller is responsible
 * for ensuring the thumb exists first (via ensureThumb).
 */
export function thumbStat(team: string, mediaId: string): { size: number; mtimeMs: number } | null {
  const p = thumbPath(team, mediaId);
  if (!existsSync(p)) return null;
  const s = statSync(p);
  return { size: s.size, mtimeMs: s.mtimeMs };
}
