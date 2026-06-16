import { existsSync, statSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { homedir } from 'os';

const pExecFile = promisify(execFile);

/** Postiz hard cap for a single media upload. */
export const POSTIZ_MAX_BYTES = 10 * 1024 * 1024;
/** Compression target, below the hard cap to leave multipart-overhead headroom. */
export const TARGET_BYTES = Math.floor(9.5 * 1024 * 1024);

/** Pure: does `bytes` exceed the cap? */
export function needsCompression(bytes: number, cap: number = POSTIZ_MAX_BYTES): boolean {
  return bytes > cap;
}

export class MediaTooLargeError extends Error {
  constructor(message = 'image could not be compressed under 10MB') {
    super(message);
    this.name = 'MediaTooLargeError';
  }
}

// Progressive passes: each re-downscales from the ORIGINAL source (not the prior
// output) to avoid compounding JPEG artifacts. sips -Z scales the longest side
// and never upscales.
const PASSES: Array<{ maxDim: number; quality: number }> = [
  { maxDim: 2560, quality: 85 },
  { maxDim: 2048, quality: 80 },
  { maxDim: 1600, quality: 72 },
];

/**
 * Produce a JPEG at destPath that is <= targetBytes when possible. Returns the
 * final size and whether the target was met. Throws only if sips fails to run.
 */
export async function compressUnderCap(
  sourcePath: string,
  destPath: string,
  targetBytes: number = TARGET_BYTES,
): Promise<{ path: string; bytes: number; underTarget: boolean }> {
  if (!existsSync(sourcePath)) throw new Error(`image-fit source missing: ${sourcePath}`);
  let bytes = Infinity;
  for (const pass of PASSES) {
    await pExecFile('sips', [
      '-Z', String(pass.maxDim),
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(pass.quality),
      sourcePath,
      '--out', destPath,
    ]);
    if (!existsSync(destPath)) throw new Error('image-fit: sips produced no output');
    bytes = statSync(destPath).size;
    if (bytes <= targetBytes) return { path: destPath, bytes, underTarget: true };
  }
  return { path: destPath, bytes, underTarget: bytes <= targetBytes };
}

const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');

export function webDir(team: string, baseDir: string = MEDIA_DIR): string {
  return join(baseDir, team, 'web');
}

export function webDerivativePath(team: string, id: string, baseDir: string = MEDIA_DIR): string {
  return join(webDir(team, baseDir), `${id}.jpg`);
}

/**
 * Return a URL safe to hand to Postiz. If the media's on-disk original is within
 * the cap, return its url unchanged. Otherwise (re)generate a cached web
 * derivative under web/<id>.jpg and return a `?variant=web` url. Throws
 * MediaTooLargeError if even the derivative can't get under the hard cap.
 * Never mutates the original file.
 */
export async function webSafeMediaUrl(
  team: string,
  media: { id: string; filename: string; url: string },
  opts: { baseDir?: string; cap?: number; target?: number } = {},
): Promise<string> {
  const baseDir = opts.baseDir ?? MEDIA_DIR;
  const cap = opts.cap ?? POSTIZ_MAX_BYTES;
  const target = opts.target ?? TARGET_BYTES;
  const src = join(baseDir, team, media.filename);
  if (!existsSync(src)) return media.url; // let the publish path handle a missing file
  if (statSync(src).size <= cap) return media.url;

  const dest = webDerivativePath(team, media.id, baseDir);
  if (!existsSync(dest) || statSync(dest).size > cap) {
    mkdirSync(webDir(team, baseDir), { recursive: true });
    await compressUnderCap(src, dest, target);
  }
  if (statSync(dest).size > cap) throw new MediaTooLargeError();
  return media.url.includes('?') ? `${media.url}&variant=web` : `${media.url}?variant=web`;
}
