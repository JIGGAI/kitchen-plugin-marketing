import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtempSync, rmSync, existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { needsCompression, compressUnderCap, POSTIZ_MAX_BYTES, TARGET_BYTES } from './image-fit';

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
