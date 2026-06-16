# Base-Photo Selection Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI image in a weekly run derive from a *different* human base photo by consolidating base selection into one ledger-driven, topical-aware selector that the generator calls per concept.

**Architecture:** The plugin's `selectNextBasePhotos` becomes the single selector — it orders candidates `usage_count ASC → topical_score DESC → random` and records each pick atomically in the `base_photo_usage` ledger. The dashboard generator stops doing its own selection and instead calls `POST /media/base-rotation/next` once per image concept (passing the prompt as `matchText`), so each pick leaves the fresh pool and the next concept gets a distinct base. The dead pre-draft selection (workflow node, LLM instruction, `select-base-photos.mjs`, `human-source-usage.jsonl`) is removed.

**Tech Stack:** TypeScript (plugin, vitest + better-sqlite3), Node ESM (`.mjs` generator), JSON workflow definition, launchd.

---

## File Structure

| File | Repo | Responsibility | Change |
|------|------|----------------|--------|
| `src/api/base-photo-rotation.ts` | kitchen-plugin-marketing | Single selector + topical scoring | Modify |
| `src/api/base-photo-rotation.test.ts` | kitchen-plugin-marketing | Unit tests for selector | Modify |
| `src/api/handler.ts` | kitchen-plugin-marketing | Route passes `matchText` through | Modify (~line 1173) |
| `scripts/generate-pending-assets.mjs` | hmx-dashboard | Calls rotation per concept; no local picker | Modify |
| `scripts/select-base-photos.mjs` | hmx-dashboard | Dead pre-selection | Delete |
| `weekly-content-generation.workflow.json` | workspace-hmx-marketing-team | Remove `select_base_photos` node + LLM base block | Modify (scripted) |
| `content-ops-defaults.md` | workspace-hmx-marketing-team | Remove base-photo constraint #2 | Modify |

---

## Task 1: Plugin — topical-aware selection in `selectNextBasePhotos`

**Files:**
- Modify: `kitchen-plugin-marketing/src/api/base-photo-rotation.ts`
- Test: `kitchen-plugin-marketing/src/api/base-photo-rotation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these to `base-photo-rotation.test.ts` inside the existing `describe('selectNextBasePhotos', …)` block (before its closing `});`):

```ts
  it('matchText picks the best topical match within the freshest tier', () => {
    seedMedia(sqlite, [
      { id: 'a', tags: ['human', 'broom', 'cleaning'] },
      { id: 'b', tags: ['human', 'beard-trim', 'client'] },
      { id: 'c', tags: ['human', 'storefront'] },
    ]); // all never-used
    const res = selectNextBasePhotos(sqlite, opts({ count: 1, matchText: 'man receiving a beard trim from his barber' }));
    expect(res.photos.map((p) => p.id)).toEqual(['b']);
  });

  it('freshness beats topical score (a used high-match loses to a fresh low-match)', () => {
    seedMedia(sqlite, [
      { id: 'match', tags: ['human', 'beard-trim'] },
      { id: 'fresh', tags: ['human', 'storefront'] },
    ]);
    // Burn the topical match once so it leaves the freshest tier.
    sqlite.prepare(`INSERT INTO base_photo_usage (id, team_id, media_id, used_at) VALUES ('s','T','match','2026-01-01')`).run();
    const res = selectNextBasePhotos(sqlite, opts({ count: 1, matchText: 'beard trim' }));
    expect(res.photos.map((p) => p.id)).toEqual(['fresh']);
  });

  it('all-zero topical scores fall back to deterministic random within the tier', () => {
    seedMedia(sqlite, [
      { id: 'a', tags: ['human', 'storefront'] },
      { id: 'b', tags: ['human', 'interior'] },
    ]); // neither matches the prompt
    // random() always returns 0 → the first row after a stable sort wins deterministically.
    const res = selectNextBasePhotos(sqlite, opts({ count: 1, matchText: 'beard trim haircut', random: () => 0 }));
    expect(res.photos.length).toBe(1);
    expect(['a', 'b']).toContain(res.photos[0].id);
  });

  it('sequential count:1 calls never repeat a base until the pool is used once', () => {
    seedMedia(sqlite, [
      { id: 'a', tags: ['human', 'beard-trim'] },
      { id: 'b', tags: ['human', 'beard-trim'] },
      { id: 'c', tags: ['human', 'beard-trim'] },
    ]); // identical tags → all tie on score, freshness + uniqueness must carry it
    const picked = [];
    for (let i = 0; i < 3; i++) {
      const r = selectNextBasePhotos(sqlite, opts({ count: 1, matchText: 'beard trim' }));
      picked.push(r.photos[0].id);
    }
    expect(new Set(picked).size).toBe(3); // 3 distinct across 3 calls
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/api/base-photo-rotation.test.ts`
Expected: the 4 new tests FAIL (matchText is ignored today, so topical/uniqueness assertions break).

- [ ] **Step 3: Add the scoring helpers and `matchText` support**

In `src/api/base-photo-rotation.ts`, add the `matchText` and `random` fields to `SelectOptions` (the type block at the top):

```ts
export type SelectOptions = {
  teamId: string;
  count: number;
  tags?: string[];        // ALL must be present (default ['human'])
  exclude?: string[];     // NONE may be present (default ['ai-generated'])
  runContext?: string | null;
  now?: string;           // ISO timestamp (injectable for tests)
  uuid?: () => string;    // id generator (injectable for tests)
  matchText?: string;     // when set, rank the freshest tier by topical match
  random?: () => number;  // tiebreak source (injectable for tests; default Math.random)
};
```

Add these two helpers just above `selectNextBasePhotos` (ported verbatim from the generator so there is one implementation):

```ts
// Topical match between an image prompt and a photo's tags. Mirrors the scoring
// the dashboard generator used before selection was consolidated here.
function tokenizeForMatch(text: string): Set<string> {
  return new Set(
    String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3),
  );
}

function scoreCandidate(promptTokens: Set<string>, tags: string[]): number {
  let score = 0;
  for (const tag of tags || []) {
    const tagStr = String(tag).toLowerCase();
    if (tagStr === 'human') continue; // universal — not informative
    if (promptTokens.has(tagStr)) score += 2; // full-tag match weighted higher
    for (const piece of tagStr.split('-')) {
      if (piece.length >= 3 && promptTokens.has(piece)) score += 1;
    }
  }
  return score;
}
```

- [ ] **Step 4: Branch the row selection on `matchText`**

In `selectNextBasePhotos`, replace the single `const rows = sqlite.prepare(...).all(...)` block (currently the `ORDER BY usageCountBefore ASC, random() LIMIT ?` query, ~lines 68-77) with this branch. Everything after it (the `insert`/`record` transaction and the `photos` mapping) stays unchanged:

```ts
  let rows: Array<any>;
  if (options.matchText && options.matchText.trim()) {
    // Topical path: pull every candidate with its usage count, then in JS sort
    // by freshness (tier) → topical score → random tiebreak, and take `count`.
    // Pool is small (≤ a few hundred), so the full scan is cheap.
    const rnd = options.random ?? Math.random;
    const tokens = tokenizeForMatch(options.matchText);
    const all = sqlite
      .prepare(
        `SELECT m.id, m.filename, m.original_name AS originalName, m.tags, m.url,
                ${USAGE_COUNT_SUBQUERY} AS usageCountBefore
         FROM media m
         WHERE m.team_id = ?${clause}`,
      )
      .all(options.teamId, ...params) as Array<any>;
    rows = all
      .map((r) => ({ r, score: scoreCandidate(tokens, JSON.parse(r.tags || '[]')), jitter: rnd() }))
      .sort((a, b) => {
        if (a.r.usageCountBefore !== b.r.usageCountBefore) return a.r.usageCountBefore - b.r.usageCountBefore;
        if (b.score !== a.score) return b.score - a.score;
        return a.jitter - b.jitter;
      })
      .slice(0, count)
      .map((x) => x.r);
  } else {
    rows = sqlite
      .prepare(
        `SELECT m.id, m.filename, m.original_name AS originalName, m.tags, m.url,
                ${USAGE_COUNT_SUBQUERY} AS usageCountBefore
         FROM media m
         WHERE m.team_id = ?${clause}
         ORDER BY usageCountBefore ASC, random()
         LIMIT ?`,
      )
      .all(options.teamId, ...params, count) as Array<any>;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd ~/kitchen-plugin-marketing && npx vitest run src/api/base-photo-rotation.test.ts`
Expected: PASS — all new tests plus the pre-existing rotation tests (the `else` branch keeps old behavior identical).

- [ ] **Step 6: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/api/base-photo-rotation.ts src/api/base-photo-rotation.test.ts
git commit -m "feat(base-rotation): topical-aware selection within the freshest tier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Plugin — pass `matchText` through the route

**Files:**
- Modify: `kitchen-plugin-marketing/src/api/handler.ts` (~lines 1173-1190)

- [ ] **Step 1: Add `matchText` to the body type and the selector call**

Replace the `POST /media/base-rotation/next` body type and `selectNextBasePhotos` call so it forwards `matchText`:

```ts
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
        count?: number; tags?: string[]; exclude?: string[]; runContext?: string; matchText?: string;
      };
      const count = Number(body.count);
      if (!Number.isFinite(count) || count <= 0) {
        return apiError(400, 'INVALID_COUNT', 'count must be a positive number');
      }
      const { sqlite } = initializeDatabase(teamId);
      const result = selectNextBasePhotos(sqlite, {
        teamId,
        count,
        tags: Array.isArray(body.tags) ? body.tags : ['human'],
        exclude: Array.isArray(body.exclude) ? body.exclude : ['ai-generated'],
        runContext: body.runContext ?? 'weekly',
        matchText: typeof body.matchText === 'string' ? body.matchText : undefined,
      });
      return { status: 200, data: result };
```

- [ ] **Step 2: Typecheck/build to verify it compiles**

Run: `cd ~/kitchen-plugin-marketing && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 3: Commit**

```bash
cd ~/kitchen-plugin-marketing
git add src/api/handler.ts
git commit -m "feat(base-rotation): accept matchText on /media/base-rotation/next

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Generator — call rotation per concept, delete the local picker

**Files:**
- Modify: `hmx-dashboard/scripts/generate-pending-assets.mjs`
- Delete: `hmx-dashboard/scripts/select-base-photos.mjs`

This task is on the **dashboard** repo, so it gets its own branch.

- [ ] **Step 1: Create the branch**

```bash
cd ~/Sites/hmx-dashboard
git checkout main && git pull --ff-only
git checkout -b feat/asset-gen-ledger-base-selection
```

- [ ] **Step 2: Remove the unused fs/path/os imports**

In `generate-pending-assets.mjs`, replace the import line:

```js
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
```

with nothing (delete all three lines). These were only used by the local usage-log helpers being removed.

- [ ] **Step 3: Delete the local picker + usage-log helpers**

Delete this entire block — the comment banner starting `// ---- Human-source picker ...` through the end of `pickHumanSource` (the functions `workspaceStateDir`, `usageLogPath`, `loadUsageHistory`, `recordUsage`, `fetchHumanLibrary`, `tokenizeForMatch`, `scoreCandidate`, `pickHumanSource`). Keep `getTagValue` (defined just above the banner) and `pollJob`/`healOrphanedPosts` (below).

- [ ] **Step 4: Replace Phase 1 selection with the per-concept rotation call**

Replace the Phase 1 block — from the `const runId = ...` line through the end of the `for (const group of imageGroups.values()) { ... }` loop (the block that currently builds `humanLibrary`, `usage`, `useTextToImage`, and calls `pickHumanSource`) — with:

```js
  // Phase 1: for each image concept, ask the rotation ledger for the single
  // freshest base that best matches the prompt. The plugin records the pick, so
  // the next concept's freshest tier excludes it — a distinct base per concept
  // within a run, cycling only after the whole library has been used once. If
  // the pool is empty (or the call fails), fall back to text-to-image so the
  // workflow keeps moving.
  const runId = getArg('run-id', '') || new Date().toISOString();
  const imageJobs = []; // { prompt, jobId, posts: [{ post, seedOnly }], filename, sourceMediaId, error? }
  for (const group of imageGroups.values()) {
    const firstPost = group.posts[0].post;
    const variantKey = getTagValue(firstPost.tags, 'workflow:variant:');
    const filename = variantKey
      ? variantKey.replace(/[^a-z0-9-]/gi, '-').slice(0, 60)
      : `asset-${firstPost.id.slice(0, 8)}`;

    let sourceMediaId = null;
    try {
      const sel = await marketingRequest('/media/base-rotation/next', {
        method: 'POST',
        teamId,
        body: { count: 1, matchText: group.prompt, runContext: 'weekly-generate' },
        headers,
        ...clientOptions,
      });
      sourceMediaId = sel?.photos?.[0]?.id || null;
      if (!sel?.poolSize) {
        console.warn(`  Base pool empty for team ${teamId} — falling back to text-to-image for this group.`);
      } else if (sourceMediaId) {
        const p = sel.photos[0];
        console.log(`  Base pick for "${group.prompt.slice(0, 60).replace(/\s+/g, ' ')}…": ${sourceMediaId.slice(0, 8)} usedBefore=${p.usageCountBefore} tags=[${(p.tags || []).slice(0, 5).join(',')}]`);
      }
    } catch (error) {
      console.error(`  base-rotation/next failed (${error.message}) — falling back to text-to-image for this group.`);
    }

    let endpoint;
    let body;
    if (!sourceMediaId) {
      endpoint = '/media/generate';
      body = { prompt: applyTextOverlayPolicy(group.prompt, { currentYear: CURRENT_YEAR }), filename };
    } else {
      endpoint = `/media/${sourceMediaId}/generate`;
      body = { prompt: wrapImageEditPrompt(group.prompt, { currentYear: CURRENT_YEAR }), type: 'image', filename };
    }

    try {
      const result = await marketingRequest(endpoint, {
        method: 'POST',
        teamId,
        body,
        headers,
        ...clientOptions,
      });
      const jobId = result.job?.id;
      const mode = sourceMediaId ? 'image-edit' : 'text-to-image';
      console.log(`  Started ${mode} job ${jobId} for ${group.posts.length} post(s) (${filename})`);
      imageJobs.push({ prompt: group.prompt, jobId, posts: group.posts, filename, sourceMediaId });
    } catch (error) {
      console.error(`  Failed to start image job for group (${group.posts.length} posts): ${error.message}`);
      imageJobs.push({ prompt: group.prompt, jobId: null, posts: group.posts, sourceMediaId, error: error.message });
    }
  }
```

Note: `runId` is retained (unchanged usage elsewhere is none, but it is harmless and keeps the `--run-id` arg working for logs). The `results.push({ ... sourceMediaId: job.sourceMediaId ... })` in Phase 2 still works because `imageJobs` entries still carry `sourceMediaId`.

- [ ] **Step 5: Syntax-check the script**

Run: `cd ~/Sites/hmx-dashboard && node --check scripts/generate-pending-assets.mjs`
Expected: no output (valid syntax). Confirm no remaining references to deleted helpers:
Run: `grep -nE "pickHumanSource|fetchHumanLibrary|human-source-usage|loadUsageHistory|recordUsage|workspaceStateDir" scripts/generate-pending-assets.mjs || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: Delete the dead pre-selection script**

```bash
cd ~/Sites/hmx-dashboard
git rm scripts/select-base-photos.mjs
```

- [ ] **Step 7: Commit**

```bash
cd ~/Sites/hmx-dashboard
git add scripts/generate-pending-assets.mjs
git commit -m "feat(asset-gen): derive each image from a distinct ledger-rotated base

Generator now asks /media/base-rotation/next per concept (matchText=prompt)
instead of its own pickHumanSource; removes the parallel human-source-usage
tracking and the dead pre-selection script.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Workspace — remove the dead pre-draft selection

**Files:**
- Modify: `~/.openclaw/workspace-hmx-marketing-team/shared-context/workflows/weekly-content-generation.workflow.json`
- Modify: `~/.openclaw/workspace-hmx-marketing-team/shared-context/content-ops-defaults.md`

This is the workspace repo (not a PR repo). Make a backup first.

- [ ] **Step 1: Back up the files being changed**

```bash
mkdir -p ~/hmx-backups/base-selection-consolidation-20260615
cd ~/.openclaw/workspace-hmx-marketing-team/shared-context
cp workflows/weekly-content-generation.workflow.json ~/hmx-backups/base-selection-consolidation-20260615/
cp content-ops-defaults.md ~/hmx-backups/base-selection-consolidation-20260615/
```

- [ ] **Step 2: Run the scripted workflow transform**

This removes the `select_base_photos` node, rewires the edge `weekly_selection → weekly_packet_draft`, and strips the two base-photo blocks from the draft + QC prompts. Run:

```bash
cd ~/.openclaw/workspace-hmx-marketing-team/shared-context
python3 - <<'PY'
import json, re
fp = 'workflows/weekly-content-generation.workflow.json'
d = json.load(open(fp))

# 1. Drop the select_base_photos node.
before = len(d['nodes'])
d['nodes'] = [n for n in d['nodes'] if n['id'] != 'select_base_photos']
assert len(d['nodes']) == before - 1, 'select_base_photos node not found'

# 2. Rewire edges: remove the two edges touching select_base_photos, add a
#    direct weekly_selection -> weekly_packet_draft edge.
d['edges'] = [e for e in d['edges'] if e['id'] not in ('e-select-draft', 'e-selectbase-draft')]
d['edges'].append({'id': 'e-select-draft', 'from': 'weekly_selection', 'to': 'weekly_packet_draft'})

nodes = {n['id']: n for n in d['nodes']}

# 3. Strip the ASSIGNED BASE PHOTOS section + the USE THE ASSIGNED BASE PHOTOS
#    hard-constraint bullet from the draft prompt.
draft = nodes['weekly_packet_draft']['config']['promptTemplate']
draft = re.sub(r'\n=== ASSIGNED BASE PHOTOS[^\n]*===\n.*?(?=\n=== )', '\n', draft, flags=re.S)
draft = re.sub(r'\n- HARD CONSTRAINT — USE THE ASSIGNED BASE PHOTOS:.*?(?=\n- |\n\Z|\Z)', '\n', draft, flags=re.S)
nodes['weekly_packet_draft']['config']['promptTemplate'] = draft
assert 'ASSIGNED BASE PHOTOS' not in draft, 'draft still references assigned base photos'

# 4. Strip the base-photo QC bullet.
qc = nodes['brand_qc']['config']['promptTemplate']
qc = re.sub(r'\n[^\n]*ASSIGNED BASE PHOTOS[^\n]*', '', qc)
nodes['brand_qc']['config']['promptTemplate'] = qc
assert 'ASSIGNED BASE PHOTOS' not in qc, 'QC still references assigned base photos'

json.dump(d, open(fp, 'w'), indent=2)
print('OK: node removed, edge rewired, prompts cleaned')
PY
```

- [ ] **Step 3: Verify the workflow is still valid and wired**

Run:
```bash
cd ~/.openclaw/workspace-hmx-marketing-team/shared-context
python3 -c "
import json
d=json.load(open('workflows/weekly-content-generation.workflow.json'))
ids={n['id'] for n in d['nodes']}
assert 'select_base_photos' not in ids
edges={(e['from'],e['to']) for e in d['edges']}
assert ('weekly_selection','weekly_packet_draft') in edges
assert all(e['from'] in ids and e['to'] in ids for e in d['edges']), 'dangling edge'
print('workflow valid; nodes=',len(ids))
"
```
Expected: `workflow valid; nodes= 16`

- [ ] **Step 4: Remove base-photo constraint #2 from defaults and renumber**

Run:
```bash
cd ~/.openclaw/workspace-hmx-marketing-team/shared-context
python3 - <<'PY'
fp = 'content-ops-defaults.md'
lines = open(fp).read().split('\n')
out, n = [], 0
for ln in lines:
    if ln.startswith('2. **Use the week') and 'assigned base photos' in ln:
        continue  # drop the dead constraint
    out.append(ln)
open(fp, 'w').write('\n'.join(out))
print('removed base-photo constraint' if any('assigned base photos' in l for l in lines) else 'NOTHING REMOVED')
PY
grep -c "assigned base photos" content-ops-defaults.md || true
```
Expected: `removed base-photo constraint`, then `0`.

Note: the surviving numbered items keep their numbers (1, 3, …). If strict renumbering is desired, manually renumber 3→2 etc. — not required for correctness.

- [ ] **Step 5: Commit the workspace repo**

```bash
cd ~/.openclaw/workspace-hmx-marketing-team
git add shared-context/workflows/weekly-content-generation.workflow.json shared-context/content-ops-defaults.md
git commit -m "chore(workflow): remove dead pre-draft base-photo selection

Selection now lives in the generator via the ledger; drop the
select_base_photos node, the LLM assigned-base block, the QC bullet, and the
content-ops base-photo constraint.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Deploy plugin, live-verify distinctness, open PRs

**Files:** none (deploy + verification)

- [ ] **Step 1: Build the plugin so the new selector is live**

```bash
cd ~/kitchen-plugin-marketing && npm run build
```
Expected: build succeeds. (file: symlink → dist is live to both the kitchen gateway and the dashboard in-process caller; no restart needed for the HTTP route.)

- [ ] **Step 2: Live-verify distinct picks via the route (non-destructive count check)**

Capture the ledger count before, fire several `count:1` calls with different prompts, and confirm the returned ids are distinct. Run:

```bash
cd ~/Sites/hmx-dashboard
cat > /tmp/verify-base-rotation.mjs <<'EOF'
import { marketingRequest, DEFAULT_LOCAL_HANDLER_PATH } from '/Users/hairmx/Sites/hmx-dashboard/lib/marketing-client.js';
const teamId='hmx-marketing-team';
const opts={ remoteBase:'', localHandlerPath:DEFAULT_LOCAL_HANDLER_PATH, port:4187 };
const prompts=[
  'barber giving a man a fresh fade in a busy shop',
  'close up of a beard trim with clippers',
  'woman barber styling a client hair',
  'broom sweeping cut hair off the floor',
  'classic barber chair and tool cabinet in a clean shop',
];
const picks=[];
for (const p of prompts){
  const r=await marketingRequest('/media/base-rotation/next',{method:'POST',teamId,
    body:{count:1,matchText:p,runContext:'claude-verify-temp'},headers:{'x-user-id':'claude-verify-temp'},...opts});
  picks.push(r?.photos?.[0]?.id);
}
console.log('picks:',picks.map(x=>x&&x.slice(0,8)));
console.log('distinct:',new Set(picks).size,'of',picks.length);
EOF
node /tmp/verify-base-rotation.mjs
```
Expected: `distinct: 5 of 5` (5 different bases). These 5 verification picks are tagged `run_context='claude-verify-temp'`.

- [ ] **Step 2b: Roll back the verification's ledger writes**

The verify call recorded 5 real usage rows; remove them so they don't skew rotation fairness:

```bash
cd ~/kitchen-plugin-marketing
node -e "
const Database=require('better-sqlite3');
const os=require('os'); const path=require('path');
const db=new Database(path.join(os.homedir(),'.openclaw','kitchen','plugins','marketing','marketing-hmx-marketing-team.db'));
const info=db.prepare(\"DELETE FROM base_photo_usage WHERE run_context='claude-verify-temp'\").run();
console.log('deleted verify rows:',info.changes);
"
```
Expected: `deleted verify rows: 5`. If the DB path differs, find it with `find ~/.openclaw -name 'marketing-hmx-marketing-team.db'` first.

- [ ] **Step 3: Push branches and open PRs (both `--base main`)**

First confirm no existing PRs:
```bash
cd ~/kitchen-plugin-marketing && gh pr view feat/base-photo-selection-consolidation 2>/dev/null || echo "no PR yet (marketing)"
cd ~/Sites/hmx-dashboard && gh pr view feat/asset-gen-ledger-base-selection 2>/dev/null || echo "no PR yet (dashboard)"
```

Then push + open:
```bash
cd ~/kitchen-plugin-marketing
git push -u origin feat/base-photo-selection-consolidation
gh pr create --base main --title "Consolidate base-photo selection (topical + rotation, ledger-driven)" \
  --body "$(cat <<'EOF'
Single ledger-driven selector: `selectNextBasePhotos` now ranks the freshest usage tier by topical match (prompt vs. tags), random tiebreak, and records each pick. `POST /media/base-rotation/next` accepts `matchText`.

Pairs with hmx-dashboard PR (generator calls this per concept) so every AI image in a run derives from a distinct human base. See `docs/superpowers/specs/2026-06-15-base-photo-rotation-consolidation-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

cd ~/Sites/hmx-dashboard
git push -u origin feat/asset-gen-ledger-base-selection
gh pr create --base main --title "Asset gen: distinct ledger-rotated base per concept" \
  --body "$(cat <<'EOF'
`generate-pending-assets.mjs` now calls `/media/base-rotation/next` per image concept (matchText=prompt) instead of its own `pickHumanSource`. Removes the parallel `human-source-usage.jsonl` tracking and the dead `select-base-photos.mjs` pre-selection.

Fixes the single-base-for-all-images bug (last run: 22 concepts, only 15 distinct bases). Requires the kitchen-plugin-marketing PR.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Report PR URLs and the workspace commit hash to the user.**

---

## Self-Review

**Spec coverage:**
- Topical-within-freshest-tier + random fallback + within-run uniqueness + cycle roll → Task 1 (`selectNextBasePhotos` sort + tests).
- Plugin-side, one authoritative selector → Tasks 1–2.
- Generator calls per concept with `matchText` → Task 3.
- Delete `pickHumanSource` + `human-source-usage.jsonl` + `select-base-photos.mjs` → Task 3.
- Remove `select_base_photos` node + LLM instruction + QC + defaults constraint → Task 4.
- Text-to-image fallback on empty pool, `source-media:<id>` traceability preserved → Task 3 (fallback branch; edit endpoint unchanged).
- Deploy + live verify distinctness + non-destructive cleanup → Task 5 (verify rows tagged `claude-verify-temp` and deleted).

**Placeholder scan:** none — all steps carry concrete code/commands.

**Type consistency:** `matchText`/`random` added to `SelectOptions` in Task 1 and consumed in Task 2; `imageJobs` entry shape (`prompt, jobId, posts, filename, sourceMediaId, error?`) matches Phase 2's existing reads in Task 3. Route body type matches the selector option names.
