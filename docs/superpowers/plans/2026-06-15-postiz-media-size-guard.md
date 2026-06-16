# Postiz Media Size Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure no image over Postiz's 10 MB limit is ever sent to Postiz, by auto-compressing a compliant version at upload (normalize) and at publish (backstop derivative).

**Architecture:** A new `src/lib/image-fit.ts` (sips-based, modeled on `src/lib/thumbnails.ts`) provides `needsCompression`, `compressUnderCap`, and `webSafeMediaUrl`. `POST /media` normalizes oversized uploads in place; `/publish` and the PATCH→Postiz cascade route every media reference through `webSafeMediaUrl`, which serves a cached `web/<id>.jpg` derivative for oversized originals via a new `?variant=web` on the file route. Library originals are never mutated at publish time.

**Tech Stack:** TypeScript, vitest, macOS `sips` (resize/recompress) + `ffmpeg` (test fixture generation) — both already used in the codebase.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/lib/image-fit.ts` | Size constants, `needsCompression`, `compressUnderCap`, web-derivative paths, `webSafeMediaUrl`, `MediaTooLargeError` | Create |
| `src/lib/image-fit.test.ts` | Unit + integration tests for the helper | Create |
| `src/api/handler.ts` | Layer 1 (upload normalize ~1055), `?variant=web` serving (~1288), Layer 2 wiring (`/publish` ~268, cascade ~862) | Modify |

---

## Task 1: `image-fit.ts` core — sizing + compression

**Files:**
- Create: `src/lib/image-fit.ts`
- Test: `src/lib/image-fit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/image-fit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/lib/image-fit.test.ts`
Expected: FAIL — `image-fit` module not found.

- [ ] **Step 3: Create `src/lib/image-fit.ts`**

```ts
import { existsSync, statSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/lib/image-fit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/lib/image-fit.ts src/lib/image-fit.test.ts
git commit -m "feat(image-fit): sips-based needsCompression + compressUnderCap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `webSafeMediaUrl` + derivative paths

**Files:**
- Modify: `src/lib/image-fit.ts`
- Test: `src/lib/image-fit.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/image-fit.test.ts` (add `writeFileSync`, `readFileSync`, `mkdirSync` to the `fs` import at the top of the file):

```ts
import { webSafeMediaUrl, webDerivativePath } from './image-fit';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';

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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/lib/image-fit.test.ts`
Expected: FAIL — `webSafeMediaUrl` / `webDerivativePath` not exported.

- [ ] **Step 3: Add path helpers + `webSafeMediaUrl` to `image-fit.ts`**

Add these imports to the top of `src/lib/image-fit.ts` (merge with the existing `fs` import line):

```ts
import { existsSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
```

Append at the end of `src/lib/image-fit.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/lib/image-fit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/lib/image-fit.ts src/lib/image-fit.test.ts
git commit -m "feat(image-fit): webSafeMediaUrl cached web derivative + paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Layer 1 — normalize oversized uploads in `POST /media`

**Files:**
- Modify: `src/api/handler.ts`

- [ ] **Step 1: Add the imports**

At the top of `src/api/handler.ts`, ensure `renameSync` and `unlinkSync` are imported from `fs` (add them to the existing `fs` import that already brings in `writeFileSync`, `readFileSync`, `existsSync`, `mkdirSync`), and add the image-fit import next to the other `../lib/...` imports (e.g. near the `thumbnails` import on line 16):

```ts
import { needsCompression, compressUnderCap, webSafeMediaUrl, webDerivativePath, MediaTooLargeError, POSTIZ_MAX_BYTES } from '../lib/image-fit';
```

- [ ] **Step 2: Make `storedFilename` reassignable**

In `POST /media`, the stored filename is currently `const storedFilename = ...`. Change it to `let`:

```ts
      let storedFilename = `${id}${ext}`;
```

- [ ] **Step 3: Normalize the file right after it's written**

In `POST /media`, immediately after `writeFileSync(filePath, buf);` (handler.ts ~1055) and before the thumbnail block, insert:

```ts
      // Layer 1 — keep oversized images under Postiz's 10MB cap. Convert to a
      // compressed JPEG in place; if it can't get under the cap, keep the
      // original and let the publish-time backstop handle it.
      if (detectedMime.startsWith('image/') && needsCompression(buf.length)) {
        const fitTmp = join(dir, `${id}.fit.jpg`);
        try {
          const res = await compressUnderCap(filePath, fitTmp);
          if (res.bytes <= POSTIZ_MAX_BYTES && res.bytes < buf.length) {
            const jpgName = `${id}.jpg`;
            const jpgPath = join(dir, jpgName);
            if (existsSync(filePath) && filePath !== jpgPath) unlinkSync(filePath);
            renameSync(fitTmp, jpgPath);
            storedFilename = jpgName;
            detectedMime = 'image/jpeg';
            buf = readFileSync(jpgPath); // record.size below reflects the normalized file
          } else {
            if (existsSync(fitTmp)) unlinkSync(fitTmp);
            console.warn(`[media] could not normalize ${id} under 10MB (got ${res.bytes} bytes)`);
          }
        } catch (err: any) {
          if (existsSync(fitTmp)) unlinkSync(fitTmp);
          console.warn(`[media] image normalization failed for ${id}: ${err?.message || err}`);
        }
      }
```

Note: `buf` is declared `let` earlier in the handler and `detectedMime` is already `let`. The thumbnail block and `record` below already use `storedFilename` / `detectedMime` / `buf.length`, so they pick up the normalized values automatically.

- [ ] **Step 4: Build to verify it compiles**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/api/handler.ts
git commit -m "feat(media): normalize oversized image uploads under 10MB (Layer 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Serve `?variant=web` from `GET /media/:id/file`

**Files:**
- Modify: `src/api/handler.ts` (~1288-1303)

- [ ] **Step 1: Serve the web derivative when requested**

Replace the body of the `GET /media/:id/file` handler (the part from `const fp = ...` through the `return` on ~1298-1303) with:

```ts
      let fp = join(MEDIA_DIR, teamId, item.filename);
      let serveMime = item.mimeType;
      if (req.query.variant === 'web') {
        const wp = webDerivativePath(teamId, item.id);
        if (existsSync(wp)) { fp = wp; serveMime = 'image/jpeg'; }
      }
      if (!existsSync(fp)) return apiError(404, 'NOT_FOUND', 'File missing from disk');

      const raw = readFileSync(fp);
      const dataUrl = `data:${serveMime};base64,${raw.toString('base64')}`;
      return { status: 200, data: { dataUrl, mimeType: serveMime, filename: item.originalName } };
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/api/handler.ts
git commit -m "feat(media): serve ?variant=web derivative from /media/:id/file

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Layer 2 — route publish media through `webSafeMediaUrl`

**Files:**
- Modify: `src/api/handler.ts` (`/publish` ~239-273, cascade ~862-872)

- [ ] **Step 1: Backstop the `/publish` path**

In `POST /publish`, after `const sources = await getBackendSources(req, teamId);` and the `results` array are set up (handler.ts ~239-240) and BEFORE the `for (const platform of body.platforms)` loop, resolve the media URLs once:

```ts
    // Layer 2 — never send an over-cap image to Postiz. Swap our own oversized
    // media for a cached web derivative; non-our-media urls pass through.
    const { db: pubResolveDb } = initializeDatabase(teamId);
    let safeMediaUrls: string[] = body.mediaUrls || [];
    try {
      safeMediaUrls = await Promise.all((body.mediaUrls || []).map(async (u) => {
        const m = String(u).match(/\/media\/([a-f0-9-]+)\/file/);
        if (!m) return u;
        const [row] = pubResolveDb.select().from(schema.media)
          .where(and(eq(schema.media.id, m[1]), eq(schema.media.teamId, teamId))).all();
        if (!row?.url) return u;
        return webSafeMediaUrl(teamId, { id: row.id, filename: row.filename, url: row.url });
      }));
    } catch (e: any) {
      if (e instanceof MediaTooLargeError) {
        return { status: 207, data: { results: body.platforms.map((p) => ({ platform: p, success: false, error: e.message, backend: 'postiz' })) } };
      }
      throw e;
    }
```

Then in the platform loop, change the `postContent` to use the resolved urls — replace `mediaUrls: body.mediaUrls,` (handler.ts ~270) with:

```ts
        mediaUrls: safeMediaUrls,
```

- [ ] **Step 2: Backstop the cascade republish path**

In the PATCH cascade, replace the media-URL resolution block (handler.ts ~862-872, the loop that builds `resolvedMediaUrls` by pushing `m.url`) with:

```ts
              // Step 3: resolve media URLs from current mediaIds, swapping any
              // over-cap original for a cached web derivative (Layer 2 backstop).
              const currentMediaIds: string[] = JSON.parse(updates.mediaIds as string || post.mediaIds || '[]');
              const resolvedMediaUrls: string[] = [];
              for (const mid of currentMediaIds) {
                const [m] = db
                  .select()
                  .from(schema.media)
                  .where(and(eq(schema.media.id, mid), eq(schema.media.teamId, teamId)))
                  .all();
                if (!m?.url) continue;
                try {
                  resolvedMediaUrls.push(await webSafeMediaUrl(teamId, { id: m.id, filename: m.filename, url: m.url }));
                } catch (e: any) {
                  if (e instanceof MediaTooLargeError) {
                    postizCascade.push({ platform: '', integrationId: '', action: 'publish', success: false, error: e.message });
                  } else {
                    throw e;
                  }
                }
              }
```

- [ ] **Step 3: Build to verify it compiles**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 4: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/api/handler.ts
git commit -m "feat(publish): route media through webSafeMediaUrl backstop (Layer 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Full suite, live backstop check, PR

**Files:** none (verification + PR)

- [ ] **Step 1: Run the full test suite**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run`
Expected: all suites PASS (existing 40 + 7 new image-fit tests).

- [ ] **Step 2: Build**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Live backstop check against the real 37 MB library image (non-destructive)**

This calls only `webSafeMediaUrl` (no Postiz publish) to prove Layer 2 produces a compliant derivative for the actual oversized image, and confirms the original is untouched.

```bash
cd ~/kitchen-plugin-marketing
node -e "
const { webSafeMediaUrl, webDerivativePath, POSTIZ_MAX_BYTES } = require('./dist/lib/image-fit.js');
const { statSync, existsSync } = require('fs');
(async () => {
  const team='hmx-marketing-team';
  const media={ id:'dd6feab3-27b2-4159-9f74-8129398a7512', filename:'dd6feab3-27b2-4159-9f74-8129398a7512.jpg', url:'/api/plugins/marketing/media/dd6feab3-27b2-4159-9f74-8129398a7512/file?team=hmx-marketing-team' };
  const url = await webSafeMediaUrl(team, media);
  const deriv = webDerivativePath(team, media.id);
  console.log('returned url:', url);
  console.log('derivative exists:', existsSync(deriv), '| size MB:', (statSync(deriv).size/1048576).toFixed(2));
  console.log('under cap:', statSync(deriv).size <= POSTIZ_MAX_BYTES);
})();
"
```
Expected: url ends with `&variant=web`; derivative exists and is well under 10 MB. (If `dist/lib/image-fit.js` exports aren't CommonJS-resolvable, run via the same in-process ESM probe pattern used elsewhere — `import` from the absolute `dist` path.)

- [ ] **Step 4: Push and open the PR (`--base main`)**

First confirm no existing PR:
```bash
cd ~/kitchen-plugin-marketing && gh pr view feat/postiz-media-size-guard 2>/dev/null || echo "no PR yet"
```

Then:
```bash
cd ~/kitchen-plugin-marketing
git push -u origin feat/postiz-media-size-guard
gh pr create --base main --title "Guard Postiz media against the 10MB cap (auto-compress)" --body "$(cat <<'EOF'
Prevents the orphaned-post failure mode (RCA in docs/superpowers/specs/2026-06-15-postiz-media-size-guard-design.md): Postiz rejects media >10MB, and an over-cap image silently failed to publish.

- New `src/lib/image-fit.ts` (sips): needsCompression, compressUnderCap, webSafeMediaUrl.
- Layer 1: `POST /media` normalizes oversized image uploads in place.
- Layer 2: `/publish` and the PATCH→Postiz cascade route media through `webSafeMediaUrl`, serving a cached `web/<id>.jpg` derivative via `?variant=web`; library originals untouched; over-cap that can't compress fails the platform with a clear error instead of orphaning.

Images only; video size guard tracked separately. Tests: 7 new (needsCompression, compressUnderCap, webSafeMediaUrl) + full suite green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Report the PR URL.**

---

## Self-Review

**Spec coverage:**
- Core helper `image-fit.ts` (needsCompression/compressUnderCap, 9.5MB target, sips passes) → Task 1.
- `webSafeMediaUrl` + cached `web/<id>.jpg` + MediaTooLargeError → Task 2.
- Layer 1 upload normalization → Task 3.
- `?variant=web` serving → Task 4.
- Layer 2 wiring in both `/publish` and cascade → Task 5.
- Error handling (Layer 1 keeps original + warns; Layer 2 fails clean) → Tasks 3 & 5.
- Testing (unit needsCompression, integration compressUnderCap + webSafeMediaUrl, live backstop) → Tasks 1, 2, 6.
- Images-only / video out of scope → respected (mime `image/` guards).

**Placeholder scan:** none — all steps carry concrete code/commands.

**Type consistency:** `webSafeMediaUrl(team, {id,filename,url}, {baseDir?,cap?,target?})`, `compressUnderCap(src,dest,target?) → {path,bytes,underTarget}`, `webDerivativePath(team,id,baseDir?)`, `needsCompression(bytes,cap?)`, `POSTIZ_MAX_BYTES`, `MediaTooLargeError` — used identically in Tasks 3–5 and the tests. The cascade's `currentMediaIds`/`resolvedMediaUrls` names match the existing surrounding code (the original declared them; this replaces that block, so they are declared exactly once).
