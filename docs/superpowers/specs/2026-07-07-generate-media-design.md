# Generate Media — Design

**Date:** 2026-07-07
**Repos touched:** `kitchen-plugin-marketing`, `hmx-dashboard`
**Author flow:** brainstorming skill → this spec → writing-plans → executing-plans

## Problem

Users can already **edit** an existing library image or video by pointing at it in the post modal and describing a change — that runs Gemini (image edit) or Kling (image-to-video) and drops the result back into the media library.

There is no equivalent way to **create a new asset from scratch**. Text-to-image exists as an endpoint (`POST /media/generate`) but has no UI outside the post editor. Text-to-video is not wired up at all. A user who wants a fresh asset today has to either upload one or edit an existing one; there is no "just make me something new" path from the Media Library itself.

## Goal

Add a **Generate Media** entry point to the Media Library on both surfaces (the marketing plugin viewed through ClawKitchen and the HMX dashboard) so a user can:

1. Click **+ Image** or **+ Video** from the media library area.
2. Enter a text prompt.
3. Optionally pick a seed image from the existing library.
4. Watch a loading state while the job runs.
5. See the finished asset in a preview area; the asset is auto-saved to Media Library.
6. Click **Regenerate** (re-run with the same or edited prompt) or **Done** (close).

The finished asset behaves like any other library asset — attachable to posts, editable, deletable.

## Scope

**In scope**

- Backend: extend `POST /media/generate` to accept `type: 'image' | 'video'`. Add a `generateVideoFromPrompt` driver that calls Kling's `video.mjs` **without** `--image` (Kling supports native text-to-video, verified in the local skill script).
- Backend: no changes to `POST /media/:id/generate` — it already handles both `image` and `video` from a seed.
- Backend: no changes to `GET /jobs/:id`.
- Plugin UI: add `+ Image` / `+ Video` buttons to the Media Library grid header in `content-library.tsx`. Add a Generate modal with type toggle, seed picker, prompt textarea, loading/result states.
- Dashboard UI: refactor `#media-view` so `Generate media` sits side-by-side with `Media upload` (left of it) with `Media library` below. Add matching Generate modal to the dashboard.
- Seed picker: image-only, **medium-to-large** thumbnails (~220px grid cells, meaningfully larger than the ~160px post-modal grid). Single click to select; × to clear.

**Explicitly out of scope**

- Aspect ratio / duration selectors in the modal (use existing team defaults from `pluginConfig`).
- Provider selectors (Image → Gemini, Video → Kling — no UI toggle).
- "Save vs discard" flow — matches the existing edit flow: auto-saved on completion. Users delete unwanted results from the grid.
- Batch generation, prompt history, prompt library — future.
- Text-to-image using anything but Gemini; text-to-video using anything but Kling.

## User flow

### Entry

Both surfaces surface two buttons, `+ Image` and `+ Video`. Clicking either opens the same modal with the type field prefilled (editable).

**Plugin (Kitchen view)** — the Media Library grid header extends from `[+ Upload] [↻]` to `[+ Image] [+ Video] [+ Upload] [↻]`. Same button style, no new panel.

**Dashboard** — the `#media-view` section reorganizes:

```
┌─ Generate media ────────┐  ┌─ Media upload ────────────────┐
│ + Image     + Video     │  │ [ file input ]                │
│                         │  │ [ upload draft list ]         │
│ (Kicker + heading only  │  │ [Upload assets] [Clear]       │
│  when idle)             │  │                               │
└─────────────────────────┘  └───────────────────────────────┘

┌─ Media library ────────────────────────────────────────────┐
│ [search] [type] [sort] [page size]                         │
│ [grid of thumbnails]                                       │
│ [pager]                                                    │
└────────────────────────────────────────────────────────────┘
```

The two upper panels sit in a 2-column responsive row. On viewports under ~900px they stack (Generate media above Media upload).

### Modal

```
┌─ Generate Media ─────────────────────────┐
│                                          │
│  Type:  (●) Image   (○) Video            │
│                                          │
│  Seed image (optional):                  │
│    [None selected]   [Pick from library →│
│    (or, once picked:)                    │
│    [thumb] filename.jpg   [× remove]     │
│                                          │
│  Prompt:                                 │
│  ┌──────────────────────────────────────┐│
│  │                                      ││
│  │                                      ││
│  └──────────────────────────────────────┘│
│                                          │
│                    [Cancel]  [Generate]  │
└──────────────────────────────────────────┘
```

**Type toggle** — prefilled from the button that opened the modal (Image or Video). Editable via radio/segmented control. If the user swaps type while a seed image is selected, the seed stays (both routes accept a seed).

**Seed picker** — clicking "Pick from library" opens a sub-modal (or expands inline) with an image-only grid using `minmax(220px, 1fr)` cells. Only items whose `mimeType` starts with `image/` are shown. One click selects and returns to the Generate modal; × clears.

**Loading state** — after **Generate**:

- Modal replaces form with a centered spinner + status line.
- Status text updates per poll: `"Generating image…"` or `"Generating video (this can take 1–3 minutes)…"`
- No cancel button on the loading state (Kling jobs cannot be cancelled server-side; a "Cancel" that only closes the modal would be misleading).

**Result state** — on job completion:

- Modal shows the generated asset inline (image as `<img>`, video as `<video controls>`).
- Small confirmation line: `Saved to library ✓` with the new filename.
- Footer: `[Regenerate]  [Done]`.
- **Regenerate** returns to the form state with the prompt preserved so the user can tweak it and run again; the previous result stays in Media Library (no automatic deletion).
- **Done** closes the modal. The Media Library grid refreshes so the new item appears.

**Error state** — modal shows an inline red banner with the message from `job.error`, plus a `[Try again]` button that returns to the form. The form values (type, seed, prompt) are preserved.

## API contract

All flows return `{ job: { id, status, sourceMediaId, type, provider, prompt, generatedMediaId, error, createdAt, completedAt } }`. The client polls the job endpoint every 4 seconds until `status === 'completed'` or `status === 'failed'`.

**Plugin API (used directly by the ClawKitchen plugin UI, exposed by the marketing plugin handler):**

| Case | Endpoint | Body |
|---|---|---|
| Text → Image | `POST /media/generate` (existing, extended) | `{ type: 'image', prompt, filename? }` |
| Text → Video | `POST /media/generate` (extended) | `{ type: 'video', prompt }` |
| Seed → Image | `POST /media/:seedId/generate` (existing) | `{ type: 'image', prompt }` |
| Seed → Video | `POST /media/:seedId/generate` (existing) | `{ type: 'video', prompt }` |
| Poll | `GET /jobs/:jobId` (existing) | — |

**Dashboard API (what the browser hits — dashboard server proxies each of these to the plugin API):**

| Case | Endpoint (browser) | Body |
|---|---|---|
| Text → Image | `POST /api/media/generate` (existing, extended) | `{ type: 'image', prompt, filename? }` |
| Text → Video | `POST /api/media/generate` (extended) | `{ type: 'video', prompt }` |
| Seed → Image | `POST /api/media/:seedId/generate-image` (existing) | `{ prompt }` |
| Seed → Video | `POST /api/media/:seedId/generate-video` (existing) | `{ prompt }` |
| Poll | `GET /api/jobs/:jobId` (existing) | — |

The dashboard already has split URL shapes for the two seeded generate routes (`-image`, `-video`) — we keep those. Only the `/api/media/generate` proxy needs to widen its passthrough (see server.js change below).

**Backward compatibility:** `POST /media/generate` today implicitly means image. The extension defaults `type` to `'image'` when omitted. Existing callers (the current post-editor "generate from prompt" flow, which sends no `type` field) are unaffected.

**Provider defaults:** `type === 'image'` → Gemini (existing text-to-image path). `type === 'video'` → Kling (new `generateVideoFromPrompt` driver, calls `video.mjs` without `--image`).

## Backend changes (`kitchen-plugin-marketing`)

### `src/generation/drivers.ts`

Add:

```ts
export async function generateVideoFromPrompt(
  prompt: string,
  outputDir: string,
  config?: Record<string, unknown>,
): Promise<DriverResult>
```

Mirrors `generateVideo`. Locates the `klingai` skill and its `scripts/video.mjs`. Requires `~/.config/kling/.credentials` present. Calls `video.mjs` with:

- `--prompt`
- `--output_dir`
- `--duration` (config or team default)
- `--aspect_ratio` (default `16:9`)
- `--mode pro`
- **No** `--image`

Same `normalizeGenerationError` for the "Kling account balance not enough" message. Return `{ filePath, metadata: { skill: 'klingai', mode: 'text-to-video', prompt } }`.

### `src/generation/runner.ts`

Replace the current `if (request.type !== 'image')` throw in `startPromptGenerationJob` — which today rejects video outright — with a check that only rejects unknown types:

```ts
if (request.type !== 'image' && request.type !== 'video') {
  throw new Error('type must be "image" or "video"');
}
```

Extend `runPromptGeneration` to branch on `request.type`:

- `image` — unchanged (Gemini via `generateImageFromPrompt`, `compressImage`, save as `.jpg`).
- `video` — call `generateVideoFromPrompt`, extract thumbnail via `extractVideoThumbnail`, save as `.mp4`, store thumbnail data URL in `thumbnailUrl`. Tags: `['ai-generated', 'text-to-video', 'source:klingai']`. Reuse `getVideoDuration(teamId)` for the duration default.

`sourceMediaId` in the DB row stays `'prompt-only'` for text-only jobs.

### `src/api/handler.ts`

`/media/generate` route (currently around line 1580):

```ts
const body = req.body as (GenerationRequest & { filename?: string }) | undefined;
if (!body?.prompt) return apiError(400, 'VALIDATION_ERROR', 'prompt is required');
const type: 'image' | 'video' = body.type === 'video' ? 'video' : 'image';
const job = startPromptGenerationJob(teamId, {
  prompt: body.prompt,
  type,
  provider: body.provider,
  config: body.config,
  filename: body.filename,
}, userId);
```

`type` defaults to `'image'` when the field is absent or any value other than `'video'`. Explicit test coverage below.

### Tests

Add unit tests in `src/generation/`:

- Runner routes `type: 'video'` to `generateVideoFromPrompt` and stores the returned `.mp4` with a thumbnail. Uses a mocked driver.
- Runner defaults to `'image'` when type is missing.
- Handler returns 400 when `prompt` is empty.
- Handler accepts `type: 'video'` and starts the job (mock the runner).

## Frontend changes — plugin (`content-library.tsx`)

New component state:

```ts
const [generateOpen, setGenerateOpen] = useState(false);
const [generateType, setGenerateType] = useState<'image' | 'video'>('image');
const [generatePrompt, setGeneratePrompt] = useState('');
const [generateSeedId, setGenerateSeedId] = useState<string | null>(null);
const [generateSeedPickerOpen, setGenerateSeedPickerOpen] = useState(false);
const [generateJobId, setGenerateJobId] = useState<string | null>(null);
const [generateStatus, setGenerateStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
const [generateResultMediaId, setGenerateResultMediaId] = useState<string | null>(null);
const [generateError, setGenerateError] = useState<string | null>(null);
```

Handlers:

- `openGenerateModal(type: 'image' | 'video')` — resets state, sets type, opens modal.
- `submitGenerate()` — POSTs to the appropriate endpoint based on `generateSeedId`, stores returned `job.id`, kicks off polling.
- `pollGenerateJob(jobId)` — 4-second polls to `GET /jobs/:id`. On `completed`, sets `generateResultMediaId`, refreshes media library, transitions to result state. On `failed`, sets `generateError`.
- `closeGenerateModal()` — resets state.
- `regenerateSame()` — returns to form state, preserves prompt/type/seed.

Media grid header (line ~990) adds two buttons before `+ Upload`:

```tsx
h('button', { onClick: () => openGenerateModal('image'), style: {...t.btnGhost, ...} }, '+ Image'),
h('button', { onClick: () => openGenerateModal('video'), style: {...t.btnGhost, ...} }, '+ Video'),
```

Modal + seed picker use existing modal styling (`t.card`, existing overlay pattern from `openMediaModal`). Seed picker grid uses `gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))'` and filters `mediaLibrary` to items whose `mimeType` starts with `image/`.

## Frontend changes — dashboard (`hmx-dashboard`)

### `public/index.html`

Restructure `#media-view`:

```html
<section id="media-view" class="page-view hidden">
  <div class="media-view-top-row">
    <div class="panel section-panel">
      <div class="section-head">
        <div>
          <div class="section-kicker">Generate media</div>
          <h2>Create with AI</h2>
        </div>
      </div>
      <div class="generate-media-actions">
        <button id="generate-image-btn" class="btn btn-primary" type="button">+ Image</button>
        <button id="generate-video-btn" class="btn btn-primary" type="button">+ Video</button>
      </div>
      <p class="section-hint">Type a prompt, optionally pick a seed image, and we'll add the result to your library.</p>
    </div>

    <div class="panel section-panel">
      <!-- existing Media upload panel, unchanged -->
    </div>
  </div>

  <div class="panel section-panel">
    <!-- existing Media library panel, unchanged -->
  </div>
</section>
```

Add the Generate modal dialog markup at the bottom of the page (co-located with other dialogs). Uses the existing `.dialog` / `.dialog-overlay` pattern.

### `public/assets/app.js`

New functions and wiring:

- Element refs: `#generate-image-btn`, `#generate-video-btn`, `#generate-modal`, seed picker sub-modal.
- `openGenerateModal(type)` — resets modal state, prefills type toggle.
- `submitGenerate()` — POST to `/api/media/generate` (no seed, with `type` in body) or `/api/media/{seedId}/generate-image` / `/api/media/{seedId}/generate-video` (with seed, based on current `type` toggle). Response `{ job }`. Kick off polling.
- `pollGenerateModalJob(jobId)` — reuses existing `pollJob`-style pattern (4-second interval, ~300s ceiling). On completion, fetches `/api/media/{generatedMediaId}` to get thumbnail URL for preview; on error, shows the message.
- `regenerateGenerateModal()` — returns to form state.
- Seed picker: renders a scrollable grid of `mediaItems.filter(i => i.mimeType?.startsWith('image/'))` at `minmax(220px, 1fr)`.

### `public/assets/app.css`

New rules:

- `.media-view-top-row { display: grid; grid-template-columns: 1fr 1fr; gap: … }` with `@media (max-width: 900px) { grid-template-columns: 1fr }`.
- `.generate-media-actions { display: flex; gap: … }` for the button row.
- Seed picker grid class targeting `minmax(220px, 1fr)`.
- Loading spinner + result preview styling for the Generate modal (reuse existing dialog styles where possible).

### `server.js`

The relevant proxies already exist. Only one needs a small change:

- `POST /api/media/generate` (line ~2647): today the passthrough body is `{ prompt, filename, config }` — it drops `type`. Widen it to `{ prompt, filename, config, type }` so `type: 'video'` reaches the plugin. Backward-compatible: existing callers omit `type` and get image behavior.
- `POST /api/media/:id/generate-image` (line ~2660): unchanged. Already hardcodes `type: 'image'` and forwards to `POST /media/:id/generate`.
- `POST /api/media/:id/generate-video` (line ~2674): unchanged. Already hardcodes `type: 'video'` and forwards to `POST /media/:id/generate`.
- `GET /api/jobs/:id` (line ~2732): unchanged.

**Cache-bust:** bump `?v=` on the `<link>` and `<script>` references to `app.css` and `app.js` in `index.html` when shipping (per repo convention).

## Failure modes

| Failure | Where | User sees | Behavior |
|---|---|---|---|
| Prompt empty | Client + `/media/generate` | Inline validation on modal | Form validates before submit; server returns 400 if it slips through. |
| Kling balance too low | Backend `normalizeGenerationError` | Modal error banner: "Kling AI account balance is too low…" | Existing message logic reused; user must top up Kling. |
| Gemini API key missing | Backend | Modal error banner with the message from the driver | Config issue, not a user error — show the message so RJ can fix env. |
| Job times out (>5 min) | Client poll ceiling | Modal error: "Generation timed out." | Server job may still complete; the generated media will appear in the library on next load. |
| Seed image no longer exists | Backend | Modal error: "Source media not found" | User can clear the seed and retry. |
| Network drop during poll | Client | Modal error banner + Try again | Job may still be running; refreshing the library will pick it up. |

## Deployment notes

- Plugin repo: `npm run build`, verify dist. Kitchen picks up new dist without gateway restart (per repo convention). Dashboard's in-process handler cache is populated on first request — restart dashboard (`kill -TERM $(lsof -ti :4187)`) to pick up new plugin dist.
- Dashboard repo: static — deploy replaces `public/` files, bump `?v=`. Server changes require the same restart.
- Kling video generation with `--mode pro` costs credits. This new flow could burn through balance faster if abused; not gating in v1 but worth surfacing in ops docs.

## Order of PRs

1. **PR 1 (plugin repo — backend)**: driver + runner + handler changes + tests. Rebuild, verify via curl with `type: 'video'`. BC-safe (endpoint still works with omitted `type`).
2. **PR 2 (plugin repo — plugin UI)**: buttons + modal + seed picker in `content-library.tsx`. Rebuild, verify in Kitchen.
3. **PR 3 (dashboard repo)**: HTML restructure + JS modal + CSS + server proxy verification. Bump `?v=`. Restart dashboard. Verify end-to-end from browser.

Each PR is independently reviewable and mergeable. PR 3 depends on PR 1 being deployed to add text-to-video capability, but doesn't depend on PR 2.

## Non-goals for this cycle

- No prompt library / suggestions.
- No per-generation cost accounting.
- No batch/multi-shot generation.
- No provider selector UI.
- No custom aspect ratios or durations in the modal.
- No workflow triggers ("also post this," etc.).
