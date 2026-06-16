import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, rmSync, existsSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { needsCompression, compressUnderCap, webSafeMediaUrl, webDerivativePath, POSTIZ_MAX_BYTES, TARGET_BYTES } from './image-fit';

const pExecFile = promisify(execFile);

describe('needsCompression', () => {
  it('is false at or under the cap, true over it', () => {
    expect(needsCompression(POSTIZ_MAX_BYTES)).toBe(false);
    expect(needsCompression(POSTIZ_MAX_BYTES - 1)).toBe(false);
    expect(needsCompression(POSTIZ_MAX_BYTES + 1)).toBe(true);
  });
  it('honors a custom cap', () => {
    expect(needsCompression(2000, 1000)).toBe(true);
    expect(needsCompression(500, 1000)).toBe(false);
  });
  it('TARGET_BYTES sits below the hard cap', () => {
    expect(TARGET_BYTES).toBeLessThan(POSTIZ_MAX_BYTES);
  });
});

describe('compressUnderCap', () => {
  let dir: string;
  let src: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'imgfit-'));
    src = join(dir, 'src.png');
    // Detailed 4000x4000 image (multi-MB PNG) so downscaling is observable.
    await pExecFile('ffmpeg', ['-f', 'lavfi', '-i', 'mandelbrot=s=4000x4000', '-frames:v', '1', '-y', src]);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('downscales a large image to a valid jpeg under the default target', async () => {
    const dest = join(dir, 'out.jpg');
    const res = await compressUnderCap(src, dest);
    expect(existsSync(dest)).toBe(true);
    expect(res.underTarget).toBe(true);
    expect(res.bytes).toBeLessThanOrEqual(TARGET_BYTES);
    expect(res.bytes).toBeLessThan(statSync(src).size);
    const { stdout } = await pExecFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', dest]);
    const dims = [...stdout.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...dims)).toBeLessThanOrEqual(2560);
  });
});

describe('webSafeMediaUrl', () => {
  let base: string;
  let mediaDir: string;
  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'imgfit-web-'));
    mediaDir = join(base, 'T');
    mkdirSync(mediaDir, { recursive: true });
  });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it('returns the original url for a small file', async () => {
    writeFileSync(join(mediaDir, 'small.jpg'), Buffer.alloc(1024, 7));
    const url = await webSafeMediaUrl(
      'T',
      { id: 'small', filename: 'small.jpg', url: '/api/plugins/marketing/media/small/file?team=T' },
      { baseDir: base },
    );
    expect(url).toBe('/api/plugins/marketing/media/small/file?team=T');
    expect(existsSync(webDerivativePath('T', 'small', base))).toBe(false);
  });

  it('creates a web derivative and returns a variant url for an oversized file, leaving the original untouched', async () => {
    const fp = join(mediaDir, 'big.png');
    await pExecFile('ffmpeg', ['-f', 'lavfi', '-i', 'mandelbrot=s=3000x3000', '-frames:v', '1', '-y', fp]);
    const before = readFileSync(fp);
    const srcSize = statSync(fp).size;
    // cap just under the real size guarantees the trigger; target = srcSize is
    // always reachable since a JPEG re-encode is smaller than the PNG source.
    const url = await webSafeMediaUrl(
      'T',
      { id: 'big', filename: 'big.png', url: '/api/plugins/marketing/media/big/file?team=T' },
      { baseDir: base, cap: srcSize - 1, target: srcSize },
    );
    expect(url).toBe('/api/plugins/marketing/media/big/file?team=T&variant=web');
    expect(existsSync(webDerivativePath('T', 'big', base))).toBe(true);
    expect(readFileSync(fp)).toEqual(before); // original byte-for-byte intact
  });
});
