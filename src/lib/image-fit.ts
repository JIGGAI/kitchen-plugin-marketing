import { existsSync, statSync, mkdirSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { homedir } from 'os';

const pExecFile = promisify(execFile);

/** Postiz hard cap for a single media upload. */
export const POSTIZ_MAX_BYTES = 10 * 1024 * 1024;
/** Conservative cross-platform target for Instagram/Postiz image uploads. */
export const SOCIAL_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Compression target, below the platform cap to leave multipart-overhead headroom. */
export const TARGET_BYTES = Math.floor(7.5 * 1024 * 1024);
/** Longest side for web-safe social still images. */
export const SOCIAL_IMAGE_MAX_DIM = 2048;

export type CropPreset = 'original' | 'square' | 'portrait' | 'landscape' | 'story';

export const CROP_PRESETS: Record<Exclude<CropPreset, 'original'>, { width: number; height: number }> = {
  square: { width: 1, height: 1 },
  portrait: { width: 4, height: 5 },
  landscape: { width: 191, height: 100 },
  story: { width: 9, height: 16 },
};

/** Pure: does `bytes` exceed the cap? */
export function needsCompression(bytes: number, cap: number = POSTIZ_MAX_BYTES): boolean {
  return bytes > cap;
}

export class MediaTooLargeError extends Error {
  constructor(message = 'image could not be optimized for social publishing') {
    super(message);
    this.name = 'MediaTooLargeError';
  }
}

// Progressive passes: each re-downscales from the ORIGINAL source (not the prior
// output) to avoid compounding JPEG artifacts. sips -Z scales the longest side
// and never upscales.
const PASSES: Array<{ maxDim: number; quality: number }> = [
  { maxDim: SOCIAL_IMAGE_MAX_DIM, quality: 85 },
  { maxDim: SOCIAL_IMAGE_MAX_DIM, quality: 80 },
  { maxDim: 1600, quality: 72 },
];

export async function imageDimensions(path: string): Promise<{ width: number; height: number }> {
  const { stdout } = await pExecFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
  if (!width || !height) throw new Error(`image-fit could not read dimensions: ${path}`);
  return { width, height };
}

export function normalizeCropPreset(value: unknown): CropPreset {
  return value === 'square' || value === 'portrait' || value === 'landscape' || value === 'story'
    ? value
    : 'original';
}

function cropBox(width: number, height: number, preset: CropPreset): { width: number; height: number } | null {
  if (preset === 'original') return null;
  const ratio = CROP_PRESETS[preset].width / CROP_PRESETS[preset].height;
  let cropWidth = width;
  let cropHeight = Math.round(cropWidth / ratio);
  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = Math.round(cropHeight * ratio);
  }
  return { width: Math.max(1, cropWidth), height: Math.max(1, cropHeight) };
}

/**
 * Produce a JPEG at destPath that is <= targetBytes when possible. Returns the
 * final size and whether the target was met. Throws only if sips fails to run.
 */
export async function compressUnderCap(
  sourcePath: string,
  destPath: string,
  targetBytes: number = TARGET_BYTES,
  cropPreset: CropPreset = 'original',
): Promise<{ path: string; bytes: number; underTarget: boolean }> {
  if (!existsSync(sourcePath)) throw new Error(`image-fit source missing: ${sourcePath}`);
  let bytes = Infinity;
  const dims = await imageDimensions(sourcePath);
  const crop = cropBox(dims.width, dims.height, cropPreset);
  for (const pass of PASSES) {
    const args = [
      '-Z', String(pass.maxDim),
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(pass.quality),
      sourcePath,
      '--out', destPath,
    ];
    if (crop) args.unshift('--cropToHeightWidth', String(crop.height), String(crop.width));
    await pExecFile('sips', args);
    if (!existsSync(destPath)) throw new Error('image-fit: sips produced no output');
    bytes = statSync(destPath).size;
    if (bytes <= targetBytes) return { path: destPath, bytes, underTarget: true };
  }
  return { path: destPath, bytes, underTarget: bytes <= targetBytes };
}

export async function optimizeImageForSocial(
  sourcePath: string,
  destPath: string,
  opts: { cropPreset?: CropPreset; cap?: number; target?: number; maxDim?: number } = {},
): Promise<{ path: string; bytes: number; width: number; height: number; optimized: boolean }> {
  const cap = opts.cap ?? SOCIAL_IMAGE_MAX_BYTES;
  const target = opts.target ?? TARGET_BYTES;
  const maxDim = opts.maxDim ?? SOCIAL_IMAGE_MAX_DIM;
  const preset = opts.cropPreset ?? 'original';
  const dims = await imageDimensions(sourcePath);
  const sourceBytes = statSync(sourcePath).size;
  const shouldOptimize = preset !== 'original' || sourceBytes > target || Math.max(dims.width, dims.height) > maxDim;
  if (!shouldOptimize) return { path: sourcePath, bytes: sourceBytes, width: dims.width, height: dims.height, optimized: false };

  await compressUnderCap(sourcePath, destPath, target, preset);
  const bytes = statSync(destPath).size;
  if (bytes > cap) throw new MediaTooLargeError(`image could not be optimized under ${Math.floor(cap / 1024 / 1024)}MB`);
  const outDims = await imageDimensions(destPath);
  return { path: destPath, bytes, width: outDims.width, height: outDims.height, optimized: true };
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
 * the platform-safe cap and dimensions, return its url unchanged. Otherwise
 * (re)generate a cached web
 * derivative under web/<id>.jpg and return a `?variant=web` url. Throws
 * MediaTooLargeError if even the derivative can't get under the platform cap.
 * Never mutates the original file.
 */
export async function webSafeMediaUrl(
  team: string,
  media: { id: string; filename: string; url: string },
  opts: { baseDir?: string; cap?: number; target?: number; maxDim?: number } = {},
): Promise<string> {
  const baseDir = opts.baseDir ?? MEDIA_DIR;
  const cap = opts.cap ?? SOCIAL_IMAGE_MAX_BYTES;
  const target = opts.target ?? TARGET_BYTES;
  const maxDim = opts.maxDim ?? SOCIAL_IMAGE_MAX_DIM;
  const src = join(baseDir, team, media.filename);
  if (!existsSync(src)) return media.url; // let the publish path handle a missing file
  const srcDims = await imageDimensions(src).catch(() => null);
  if (!srcDims) return media.url; // non-image media keeps the existing path
  if (statSync(src).size <= cap && (!srcDims || Math.max(srcDims.width, srcDims.height) <= maxDim)) return media.url;

  const dest = webDerivativePath(team, media.id, baseDir);
  const destDims = existsSync(dest) ? await imageDimensions(dest).catch(() => null) : null;
  if (!existsSync(dest) || statSync(dest).size > cap || !destDims || Math.max(destDims.width, destDims.height) > maxDim) {
    mkdirSync(webDir(team, baseDir), { recursive: true });
    await optimizeImageForSocial(src, dest, { cap, target, maxDim });
  }
  if (statSync(dest).size > cap) throw new MediaTooLargeError();
  return media.url.includes('?') ? `${media.url}&variant=web` : `${media.url}?variant=web`;
}
