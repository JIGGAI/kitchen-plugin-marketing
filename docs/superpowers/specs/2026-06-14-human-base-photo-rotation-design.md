# Human Base-Photo Rotation — Design

**Date:** 2026-06-14
**Status:** Approved (Approach A)
**Repos touched:** `kitchen-plugin-marketing` (primary), `hmx-dashboard` (selection script), workspace files (workflow JSON + ops defaults)

## Problem

The weekly content-planning step generates new images by editing a **base photo tagged `human`** from the marketing media library. Which base photo to use is decided entirely by an LLM in the weekly-generation workflow, instructed (in prose) to "pick a base photo not used in the immediately previous week." Nothing records what was actually used, so:

- The LLM has no usage history → it cannot verify rotation and punts to human review every run (`weekOverWeekBasePhotoRotation: human_review_required`).
- In practice the **same human photos get reused week after week**.

We want the freshest base image every week: keep a running list of what's been used, prefer photos we haven't used, and when the whole pool has been used, start the cycle again.

## Current state (as found)

- Pool: **242** real human base photos (`tags LIKE '%human%'` AND NOT `ai-generated`) in `marketing-hmx-marketing-team.db`, table `media` (`tags` = JSON array text). At ~6–7 bases/week a full cycle is ~35–40 weeks.
- Selection is LLM-prose-driven across `weekly_packet_draft`, `brand_qc`, `social_handoff_packet` nodes in `weekly-content-generation.workflow.json`. The generation runner (`src/generation/runner.ts`) only consumes a `sourceMediaId` it is handed — it does not choose.
- Workflow engine supports `tool: exec` nodes (e.g. `generate-pending-assets-hourly.workflow.json` runs `node .../generate-pending-assets.mjs`). LLM prompts support `{{file:...}}` interpolation.

## Decisions (locked)

1. **Selection:** deterministic — a code step computes the next base photos and hands the workflow exact media UUIDs. The LLM no longer chooses.
2. **Mark "used":** at selection time (packet build). Occasionally "burning" a photo from a rejected packet is acceptable given the 242-photo pool; it self-heals next cycle.
3. **Order:** random among unused; when the pool is exhausted, reshuffle and start a new cycle. Implemented as `ORDER BY usage_count ASC, random()` — never-used first, random within the freshest tier; once every photo shares the same count the whole pool is the freshest tier again (automatic cycle restart).

## Architecture (Approach A)

### Data — the running list

New table in the marketing plugin DB:

```
base_photo_usage(
  id          TEXT PRIMARY KEY,     -- uuid
  team_id     TEXT NOT NULL,
  media_id    TEXT NOT NULL,        -- FK-ish to media.id
  used_at     TEXT NOT NULL,        -- ISO timestamp
  run_context TEXT                  -- optional: workflow run id / "weekly" / "manual"
)
```

Index on `(team_id, media_id)`. "Usage count" for a photo = number of rows. This table **is** the running list / audit trail.

### Selector — API endpoints

`POST /media/base-rotation/next`
Body: `{ count: number, tags?: string[] = ["human"], exclude?: string[] = ["ai-generated"], runContext?: string }`
Behavior (single transaction):
1. Candidate pool = media for team whose `tags` include **all** of `tags` and **none** of `exclude`.
2. `ORDER BY usage_count ASC, random() LIMIT count` (usage_count via left join / subquery on `base_photo_usage`).
3. Insert one `base_photo_usage` row per chosen photo (`used_at = now`, `run_context`).
4. Return `{ photos: [{ id, filename, originalName, tags, url, usageCountBefore }], cycle, poolSize }`.

Edge cases: `count` larger than the freshest tier spans into the next tier naturally (the ORDER BY handles it). Empty pool → return `{ photos: [], poolSize: 0 }` (caller flags). `count <= 0` → 400.

`GET /media/base-rotation/status?tags=human&exclude=ai-generated`
Returns `{ poolSize, cycle, usedThisCycle, neverUsed, leastUsedCount, mostUsedCount }` so "running low" is a real signal, not a guess. (`cycle = min usage_count across pool`.)

### Workflow wiring

Add a `tool: exec` node `select_base_photos` between `weekly_selection` and `weekly_packet_draft`:

```json
{
  "id": "select_base_photos",
  "type": "tool",
  "name": "Select fresh base photos",
  "config": {
    "tool": "exec",
    "args": { "command": "node /Users/hairmx/Sites/hmx-dashboard/scripts/select-base-photos.mjs --team hmx-marketing-team --count 7" },
    "agentId": "hmx-marketing-team-lead",
    "timeoutMs": 120000
  }
}
```

`scripts/select-base-photos.mjs` (dashboard repo, mirrors `generate-pending-assets.mjs`):
- Invokes the selector by importing the marketing plugin's built handler directly (`require('.../kitchen-plugin-marketing/dist/api/handler.js')`) and calling `POST /media/base-rotation/next` in-process — the same standalone-node pattern used by other exec scripts (e.g. the revenue backfill). No HTTP round-trip.
- Writes the chosen photos to a **stable path** `shared-context/state/weekly-base-photos.current.md` (human-readable list: `plugin-media:<uuid>` + originalName + tags). Overwritten each run; the durable history lives in `base_photo_usage`.
- Exits non-zero (failing the node) if the pool is empty, so a dry library surfaces loudly instead of silently reusing.

`weekly_packet_draft` prompt change: remove the "select fresh base photos / flag if low" prose; add a block that reads `{{file:shared-context/state/weekly-base-photos.current.md}}` with: *"Use EXACTLY these provided base photos as your image bases — one base photo per distinct image concept, in the order given. Reference each as `plugin-media:<uuid>`. Do not pick any other library photo as a base."*

`brand_qc` prompt change: the rotation gate becomes "confirm the packet used only the provided base photos (no off-list library bases)" instead of "verify rotation or punt to human review."

`content-ops-defaults.md` constraint #2: rewrite to describe the deterministic mechanism (system hands the week's base photos via `weekly-base-photos.current.md`; agent must use exactly those) rather than "you select fresh ones."

### Testing

vitest against an `:memory:` DB (project already uses vitest):
- never-used photos are returned before used ones;
- random ordering within the same usage tier (statistical / seed-independent assertion: all returned are from the min tier);
- exhaustion → next cycle (after all used once, selection draws from the full pool again);
- `exclude` filters out `ai-generated`;
- `count` greater than the freshest tier spans tiers without erroring;
- a `base_photo_usage` row is written per returned photo (mark-at-selection), atomically;
- empty pool returns `[]`.

### Deploy

- Rebuild plugin (`npm run build`; `file:` symlink → live). Restart dashboard so its in-process handler picks up new dist.
- Apply workflow JSON + script + `content-ops-defaults.md` edits (workspace files committed per existing convention; backups already taken at `~/hmx-backups/base-photo-rotation-20260614-000721/`).
- PRs: `kitchen-plugin-marketing` (schema + endpoints + tests) and `hmx-dashboard` (`select-base-photos.mjs`), both `--base main`.

## Out of scope (YAGNI)

- Recording usage for manual one-off generations from the dashboard Media UI (endpoint supports it via `runContext`, but no UI wiring now).
- Per-subject/face dedup or visual similarity — tag-based rotation only.
- Backfilling historical usage from past weekly packets — the running list starts empty (every photo treated as never-used on first run, which is the desired "freshest first" behavior anyway).
