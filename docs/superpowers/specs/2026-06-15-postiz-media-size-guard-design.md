# Postiz media size guard — design

**Date:** 2026-06-15
**Repo:** `kitchen-plugin-marketing` (dashboard proxies to it; no dashboard change)
**Context:** RCA of the orphaned Juneteenth IG post (see [[reference_postiz_publish_pipeline_gotchas]]). Postiz rejects media over **10 MB** (`10485760` bytes). Generated images are tiny, but manually-uploaded or library-selected photos can be 30-40 MB. When such an image is published (or re-published via the PATCH cascade), Postiz returns `"File size exceeds the maximum allowed size"` and the post fails to publish.

## Goal

Guarantee no image over Postiz's 10 MB cap is ever sent to Postiz, by compressing a compliant version automatically. Defense-in-depth across two layers:

1. **Upload** — normalize oversized images as they enter the library.
2. **Publish** — a backstop that catches anything still over the cap (e.g. pre-existing large library images) right before it goes to Postiz.

Library originals are never silently destroyed at publish time (they may be high-res generation base photos).

## Core helper — `src/lib/image-fit.ts`

New module, modeled on the existing `src/lib/thumbnails.ts` (also `sips`-based).

- `export const POSTIZ_MAX_BYTES = 10 * 1024 * 1024;`
- `export const TARGET_BYTES = Math.floor(9.5 * 1024 * 1024);` — headroom under the hard cap for multipart overhead.
- `export function needsCompression(bytes: number, cap = POSTIZ_MAX_BYTES): boolean` — pure: `bytes > cap`. Unit-testable without shelling out.
- `export async function compressUnderCap(sourcePath: string, destPath: string, targetBytes = TARGET_BYTES): Promise<{ path: string; bytes: number; compressed: boolean }>`
  - Uses `sips` (macOS, already a dependency of `thumbnails.ts`).
  - Strategy: progressive passes until `statSync(destPath).size <= targetBytes`:
    1. Pass 1: `sips -Z 2560 -s format jpeg -s formatOptions 85` (max longest side 2560, quality 85).
    2. If still over: re-run on the output with `-Z 2048 ... formatOptions 80`.
    3. If still over: `-Z 1600 ... formatOptions 72`.
  - 2560px @ q85 keeps images high-res enough to serve as a generation base while bringing typical 30-40 MB photos well under target in one pass; later passes are a safety net for unusually dense images.
  - If the final size is still over `targetBytes` after all passes, return `{ path: destPath, bytes, compressed: true }` anyway and let the caller decide (Layer 1 keeps original + warns; Layer 2 fails that platform with a clear error).
  - Throws only on `sips` execution failure (caller catches).

## Layer 1 — upload normalization (`POST /media`, handler.ts ~1058)

After the uploaded buffer is written to `filePath` and before/around thumbnail generation, for `image/*` mime types only:

- If `needsCompression(buf.length)`: run `compressUnderCap(filePath, tmpPath)`. If the result is `<= POSTIZ_MAX_BYTES` and smaller than the original, atomically replace the stored file with it and recompute the stored `size`. The media keeps the same `id` and `filename` (`.jpg` ext already used for stored images).
- If compression fails or can't get under the cap, keep the original file, log a warning (`[media] could not normalize <id> under 10MB`), and proceed — Layer 2 is the backstop.
- Non-image uploads and already-compliant images are untouched.
- The existing 25 MB `sourceUrl` safety cap stays; this adds size *normalization* below it.

Note: this normalizes NEW uploads to ≤9.5 MB at high resolution. It does not retroactively touch existing library files — those are covered by Layer 2.

## Layer 2 — publish backstop

A shared resolver used by both publish paths, in `image-fit.ts`:

- `export async function webSafeMediaUrl(team: string, media: { id: string; filename: string; url: string }): Promise<string>`
  - If the on-disk original (`originalPath(team, media.filename)`) is `<= POSTIZ_MAX_BYTES`, return `media.url` unchanged.
  - Else compress to a cached derivative `MEDIA_DIR/<team>/web/<id>.jpg` (idempotent: reuse if it already exists and is ≤ cap), and return its serving URL `/api/plugins/marketing/media/<id>/file?team=<team>&variant=web`.
  - If the derivative still can't get under `POSTIZ_MAX_BYTES`, throw `MediaTooLargeError` so the caller fails that platform cleanly.

**Serving the derivative:** `GET /media/:id/file` gains an optional `?variant=web` that serves `MEDIA_DIR/<team>/web/<id>.jpg` when present (falls back to the original if absent). Postiz fetches the image from this URL, so the variant must be servable.

**Cascade republish (handler.ts ~862-872):** it already resolves `currentMediaIds` → `schema.media` rows. Replace the `resolvedMediaUrls.push(m.url)` with `resolvedMediaUrls.push(await webSafeMediaUrl(teamId, m))`. On `MediaTooLargeError`, push a cascade entry `{ action: 'publish', success: false, error: 'image could not be compressed under 10MB' }` and skip that pair (consistent with how other per-pair failures are recorded).

**`/publish` (handler.ts ~268-273):** `body.mediaUrls` are strings. For each url that matches our own media pattern (`/media/<id>/file`), look up the media row by id, run it through `webSafeMediaUrl`, and substitute. URLs that aren't our media (external) pass through unchanged. On `MediaTooLargeError`, return that platform result as `{ success: false, error: 'image could not be compressed under 10MB' }` (no Postiz call).

## Data flow (after)

```
upload:   POST /media → write → if image >10MB → compressUnderCap → replace stored file
publish:  /publish or cascade → for each media → webSafeMediaUrl
            original ≤10MB → original url
            original >10MB → cached web/<id>.jpg derivative url (≤9.5MB)
            can't compress → fail that platform with clear error (no orphaning)
serve:    GET /media/:id/file?variant=web → web derivative (fallback: original)
```

## Testing

`src/lib/image-fit.test.ts` (vitest):
- **Unit:** `needsCompression` — boundary cases (under, equal, over the cap).
- **Integration:** synthesize a >10 MB image in a tmp dir (e.g. `sips` upscales/encodes a large canvas, or generate a large random-noise PNG and convert), run `compressUnderCap`, assert result exists, is valid JPEG (`sips -g format`), and `size <= TARGET_BYTES`.
- **Integration:** `webSafeMediaUrl` returns the original url for a small file, and a `?variant=web` url plus a created derivative file for a large one; original file is byte-for-byte unchanged.

Handler-level: a `/publish` test with a stubbed Postiz backend asserting a >10 MB media yields a `variant=web` url in the outbound publish call while the original on disk is untouched. (If stubbing Postiz is impractical in the existing test setup, cover the substitution logic by extracting it into a small pure-ish function tested directly; note this in the plan.)

## Risks / notes

- `sips` is macOS-only — same constraint the codebase already accepts (`thumbnails.ts`). Not portable to Linux CI without a fallback; out of scope.
- Scope is **images**. Videos have separate Postiz limits and are currently disabled — explicitly out of scope.
- Plugin change is live on `npm run build` (file: symlink); the dashboard in-process caller picks up the new dist after its restart, but the publish/upload paths run through the gateway/handler that rebuild covers.
- `?variant=web` derivatives live under `MEDIA_DIR/<team>/web/` alongside `thumbs/`; they're regenerable and safe to delete.

## Out of scope

- Fix A (making the PATCH→Postiz cascade non-destructive / surfacing failures) — separate, higher-value follow-up.
- Retroactively compressing the entire existing library.
- Video size handling.
