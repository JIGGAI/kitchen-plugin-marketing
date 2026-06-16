# Base-photo selection consolidation — design

**Date:** 2026-06-15
**Repos touched:** `kitchen-plugin-marketing`, `hmx-dashboard`, `~/.openclaw/workspace-hmx-marketing-team` (workflow + defaults)
**Supersedes the integration assumptions in:** `2026-06-14-human-base-photo-rotation-design.md`

## Problem

Weekly content generation derives each AI image by editing a "human"-tagged base photo. The customer wants **every generated image in a run derived from a different human base** — not one base reused across many assets.

Two disconnected mechanisms exist today:

- **System 1 (rotation, built 2026-06-14):** `selectNextBasePhotos` + `base_photo_usage` ledger + the weekly `select_base_photos` workflow node. It pre-picks 7 distinct bases *before* the draft exists, writes them to `weekly-base-photos.current.md`, and the copywriter LLM is told to reference them as `plugin-media:<id>` in image prompts.
- **System 2 (the actual generator):** `hmx-dashboard/scripts/generate-pending-assets.mjs`. It ignores System 1 entirely and runs its own `pickHumanSource`, scoring human photos against prompt words and tracking usage in a separate file, `human-source-usage.jsonl`.

**Root cause of the bug:** Generation is governed 100% by `pickHumanSource`, whose sort is `topical-score DESC, then least-recently-used`. Score is the *primary* key, so a base whose tags broadly match common barbershop vocabulary wins the top score for many prompts and is reused within a single run. Evidence — run `2026-06-15T00:08`: **22 image groups, only 15 distinct bases**, one base used 5×. The pool is 242 photos, so there is no scarcity reason to repeat.

**Why System 1 has no effect:** The handoff breaks in two places. (1) `generate-pending-assets.mjs` never reads base refs out of prompts. (2) The prompts contain no refs anyway — verified: 0 of 100 posts have a `plugin-media:` ref in their image-prompt. So the ledger, the weekly node, and the LLM instruction run every week and change nothing about which photos get edited.

## Goal

Consolidate to **one** selection mechanism that, for each image concept in a run:

1. Considers only the **freshest tier** — bases with the lowest usage-count in the ledger (never-(re)used this cycle).
2. Within that tier, picks the **best topical match** for the prompt (photo tags vs. prompt words).
3. If nothing in the fresh tier topically matches (all scores 0), **randomly** picks from the fresh tier.
4. **Never reuses a base within the same run.**
5. Only when the whole library has been used once (cycle complete) does it roll to the next cycle and draw the now-least-used bases again.

This is a single ordering — `usage_count ASC → topical_score DESC → random` — drawn one at a time, recording each pick so it leaves the fresh pool for the rest of the run.

## Approach

Selection moves into the plugin (where the ledger lives) so there is one authoritative selector. The generator stops selecting and just calls it per concept.

### 1. Plugin: topical-aware selection in `selectNextBasePhotos`

`kitchen-plugin-marketing/src/api/base-photo-rotation.ts`

- Add optional `matchText?: string` and `random?: () => number` (injectable, defaults to `Math.random`) to `SelectOptions`. The `random` injectable makes the tiebreak deterministic in tests.
- When `matchText` is present, replace the SQL `ORDER BY usageCountBefore ASC, random()` with a JS pass: fetch all candidate rows (team + tag filter) with their `usageCountBefore` (≤242 rows — trivial), then sort by:
  1. `usageCountBefore` ASC (freshness tier),
  2. topical score DESC (0 when no `matchText`),
  3. random tiebreak (seeded by `uuid()`/injectable for tests),
  and take the first `count`.
- Port the generator's scoring into the plugin as the single implementation: `tokenizeForMatch(text)` (lowercase, split non-alphanumeric, keep tokens ≥3 chars) and `scoreCandidate(tokens, tags)` (skip the universal `human` tag; +2 for a full-tag token match, +1 per hyphen-piece match).
- When `matchText` is absent, behavior is byte-for-byte the existing rotation (back-compat for `status` callers and any manual use).
- Recording in the ledger is unchanged (atomic insert per returned photo).

### 2. Plugin: pass `matchText` through the route

`kitchen-plugin-marketing/src/api/handler.ts` — `POST /media/base-rotation/next` reads `body.matchText` (string, optional) and forwards it to `selectNextBasePhotos`. No other route changes.

### 3. Generator: call the plugin per concept; delete the local picker

`hmx-dashboard/scripts/generate-pending-assets.mjs`

- For each image-prompt group, call `POST /media/base-rotation/next` with `{ count: 1, matchText: <group.prompt>, runContext: 'weekly-generate' }`. Use the returned photo `id` as `sourceMediaId` for the `POST /media/<sourceId>/generate` edit job.
- Because each call records to the ledger, the next call's freshest tier excludes it — within-run uniqueness is automatic, and cycling is automatic when the tier empties.
- **Delete** `pickHumanSource`, `scoreCandidate`, `tokenizeForMatch`, `fetchHumanLibrary`, `loadUsageHistory`, `recordUsage`, and all `human-source-usage.jsonl` reads/writes. The ledger is now the single source of truth.
- Keep the text-to-image fallback: if a `next` call returns an empty pool (`poolSize === 0`), fall back to `POST /media/generate` so a dry library still moves the workflow forward, logged loudly.
- Image-edit results remain auto-tagged `source-media:<sourceId>` for traceability (unchanged in the plugin's generation runner).

### 4. Remove the dead pre-selection

- **Workflow** (`weekly-content-generation.workflow.json`): remove the `select_base_photos` node and re-point edges `weekly_selection → weekly_packet_draft` directly.
- **Draft prompt** (`weekly_packet_draft`): remove the `=== ASSIGNED BASE PHOTOS ===` block and the "USE THE ASSIGNED BASE PHOTOS" hard-constraint paragraph. Leave all asset-key / same-day-reuse rules intact.
- **Defaults / QC**: drop the base-photo constraint added 2026-06-14 from `content-ops-defaults.md` and the weekly QC node, since base assignment is no longer the LLM's job.
- `select-base-photos.mjs` and `weekly-base-photos.current.md` become unused; remove the script and stop writing the file. (The seed script `seed-base-usage-from-derived.cjs` stays — it backfills the ledger and is still useful.)

## Data flow (after)

```
weekly_selection (LLM)
  → weekly_packet_draft (LLM: prompts only, no base assignment)
  → … calendar sync …
  → generate_pending_assets (per concept):
        POST /media/base-rotation/next {count:1, matchText: prompt}
          → plugin: freshest tier → topical match → random → record in ledger → return 1 base
        POST /media/<base>/generate {edit prompt}  → generated image
```

Single source of truth: the `base_photo_usage` ledger. Single selector: `selectNextBasePhotos`.

## Testing

- **Plugin unit tests** (`base-photo-rotation.test.ts`, in-memory sqlite, injected `now`/`uuid`):
  - `matchText` picks the highest-scoring photo *within* the lowest usage tier, not a higher-scoring photo from a more-used tier (freshness beats topical).
  - All-zero scores → random within the freshest tier (deterministic via injected uuid).
  - Sequential `count:1` calls never repeat a base until the whole pool is used once, then roll to the next cycle.
  - Absent `matchText` → identical output to the pre-change rotation.
- **Generator:** `--dry-run` lists per-group intended calls without firing jobs. Manual non-destructive check: a run produces N distinct bases for N concepts (assert distinct in the ledger for the run_context), with no jobs actually emitted under dry-run.

## Risks / notes

- Plugin change is live on `npm run build` (file: symlink); dashboard generator picks up new dist after restart, but the generator only calls the HTTP route, so a plugin rebuild is enough for the selection change.
- `matchText` is the full image prompt; tokenization already filters to ≥3-char tokens, so prompt length is not a concern at 242 candidates.
- Removing the workflow node + LLM instruction touches the workspace repo (not a PR repo) — change in place with a pre-change backup.
- No re-seed needed; the existing ledger carries forward. Historical `human-source-usage.jsonl` is abandoned, not migrated (the ledger already reflects real usage via the seed + weekly node history).

## Out of scope

- Re-seeding or reconciling the two historical usage stores.
- Any change to the image-edit generation runner itself (Gemini call, text-overlay policy).
- Video generation (currently disabled by kill-switch).
