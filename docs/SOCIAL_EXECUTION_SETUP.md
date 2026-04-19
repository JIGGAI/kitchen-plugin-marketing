# Social execution setup — marketing → social handoff

End-to-end guide for wiring content generation in a marketing team through to automated publishing by a social team. Covers plugin installation across multiple teams, the Postiz requirement, workflow topology, naming conventions the editor picker relies on, and a demo walkthrough.

---

## Overview

The content pipeline runs across two teams:

```
hmx-marketing-team                                    hmx-social-team
┌──────────────────────────────────┐                 ┌──────────────────────────────────┐
│ weekly-content-generation        │                 │ social-execution-from-handoff    │
│  ├─ llm: content, captions, …    │  fire-and       │  ├─ llm: parse handoff           │
│  ├─ llm: social_handoff_packet   │  forget handoff │  ├─ tool: driver_status_snapshot │
│  └─ handoff ───────────────────┼─────────────────▶ │  ├─ llm: scheduling_manifest     │
│                                  │                 │  ├─ handoff_instagram ────┐     │
│                                  │                 │  ├─ handoff_facebook ─┐   │     │
│                                  │                 │  ├─ handoff_tiktok ─┐ │   │     │
│                                  │                 │  ├─ handoff_x ───┐ │ │   │     │
│                                  │                 │  └─ handoff_gbp ─┤ │ │ │ │     │
└──────────────────────────────────┘                 └──────────────────┼─┼─┼─┼─┼─────┘
                                                                        ▼ ▼ ▼ ▼ ▼
                                                           social-post-to-<platform>-v1
                                                        (one workflow per platform; selects
                                                         account, uploads media, publishes)
```

Every handoff node has the same `type: "handoff"`. What differs is the `targetWorkflowId` — that's the signal the Kitchen workflow editor uses to render per-platform account pickers.

---

## Prerequisites

### 1. `kitchen-plugin-marketing` must be installed on BOTH teams

The plugin is per-team. Installing it on only the marketing team means the social team's handoff nodes have no way to enumerate connected accounts (see [Why the social team needs it](#why-the-social-team-needs-the-marketing-plugin)).

Install via Kitchen for each team:
- In ClawKitchen, open the target team → **Plugins** tab → enable `marketing`
- Repeat for the other team

### 2. Postiz is required (for now)

All social publishing currently goes through **Postiz** (https://postiz.com) as the single backend. The plugin supports gateway and direct-API backends in code, but Postiz is what's wired up and tested. Treat Postiz as a hard requirement when enabling the social execution pipeline.

### 3. Connect Postiz on each team

For **each** team with the plugin enabled:

1. Open the plugin's **Accounts** tab for that team
2. Paste the Postiz API key (same key per business)
3. Click **Save & Detect**

That writes to the plugin's `plugin_config` table in the team's DB. Verify with:

```bash
sqlite3 ~/.openclaw/kitchen/plugins/marketing/marketing-<team-id>.db \
  "SELECT key FROM plugin_config;"
```

You should see `postiz`.

### Why the social team needs the marketing plugin

The editor UI that renders handoff node account pickers lives in ClawKitchen. When you're editing a workflow in `hmx-social-team`, the picker queries `/api/plugins/marketing/integrations?team=hmx-social-team`. If the plugin isn't installed on social team, that endpoint returns 404. If it's installed but Postiz isn't connected, it returns `{ integrations: [] }` — picker shows "No accounts found" and you'll have no accounts to pick.

Both sides of the handoff (the source team editing the outgoing node, and the target team editing incoming handoff nodes) need the plugin + Postiz config to get a usable picker experience.

---

## Workflow naming convention

The editor's handoff account picker derives its target platform from the target workflow's name, using this regex:

```
^social-post-to-(.+)-v\d+$
```

| Target workflow ID | Picker platform |
|---|---|
| `social-post-to-instagram-v1` | `instagram` |
| `social-post-to-facebook-v1` | `facebook` |
| `social-post-to-tiktok-v1` | `tiktok` |
| `social-post-to-x-v1` | `x` |
| `social-post-to-google-business-v1` | `google-business` |
| `social-execution-from-handoff` | *(no match → no picker)* |

**If you add a new per-platform workflow**, name it `social-post-to-<platform>-v<N>` so the editor picks it up automatically. Otherwise the handoff node pointing to it will have no account picker.

Postiz variants (`instagram` vs `instagram-standalone`, `facebook` vs `facebook-page`, `linkedin` vs `linkedin-page`) collapse to the same canonical platform in the picker, so all connected accounts for that platform appear together. The raw Postiz identifier is still preserved per-account and used at publish time so the right `__type` is sent to Postiz.

---

## Demo: content generation → social execution

### Step 1 — marketing team generates the handoff

Run `weekly-content-generation` on `hmx-marketing-team`. Its final `handoff` node targets `social-execution-from-handoff` on `hmx-social-team` and passes:

- `handoffContent` — the full marketing-to-social handoff markdown
- `sourceHandoffPath` / `sourcePacketPath` — where the files landed
- `sourceWorkflowId`, `sourceRunId` — audit trail
- `kitchenTeamId: "hmx-marketing-team"` — where connected accounts live
- `integrationIds` — optional pre-selected IDs (or empty to let downstream decide)

Because this handoff targets a non-per-platform workflow, the editor does **not** render an account picker for it — account selection is deferred to the downstream per-platform handoff nodes.

### Step 2 — social team fans out per platform

`social-execution-from-handoff` parses the incoming handoff, takes a driver status snapshot, produces a `scheduling_manifest` JSON with per-platform integration IDs, then fires five handoff nodes (one per platform). Each per-platform handoff:

- Targets `social-post-to-<platform>-v1`
- Renders an account picker in the editor (after plugin + Postiz are set up on social team)
- Forwards `{{trigger.integrationIds}}` by default; operators can override in the editor picker to pin specific accounts

### Step 3 — per-platform workflow publishes

`social-post-to-instagram-v1` (and siblings) receive the manifest + selected integration IDs, uploads media to Postiz, writes a post record via the plugin, and calls `/publish`. The plugin's `BaseDriver` resolves each integration's raw Postiz identifier (`instagram` vs `instagram-standalone`) and passes it to Postiz so the correct `__type` is applied at publish time — no per-variant workflow branching needed.

### Step 4 — dashboard reflects outcomes

The HMX dashboard reads back via the same plugin. Posts, media, generation jobs, and publish audit trail (`post_platform_publishes`) populate the dashboard surfaces without the dashboard ever holding Postiz credentials itself.

---

## Editor behavior reference

When you open a handoff node in the Kitchen workflow editor:

| Condition | Picker behavior |
|---|---|
| Target workflow is `social-post-to-<platform>-v<N>` | Picker appears, filtered to that platform's accounts |
| Target workflow doesn't match the convention | No picker — node acts as a generic forwarder |
| Plugin installed on this team but no Postiz connected | Picker shows "No accounts found" with hint to open Accounts tab |
| Plugin not installed on this team | Picker shows "Loading…" then disappears (fetch returns 404) |

Accounts are grouped by **canonical platform**. Variant accounts (e.g. `instagram-standalone`) show their raw identifier in parentheses in the list so operators can tell them apart.

---

## Extending beyond Postiz (future)

The plugin's `BaseDriver` supports three backends in this order:

1. **Postiz** — default, wired, tested. Requires a Postiz API key per team.
2. **Gateway** — OpenClaw gateway messaging channels (Discord/Telegram). Scaffolding exists, surface-level only.
3. **Direct API** — per-platform OAuth with credentials stored in the plugin DB (`social_accounts` table). Scaffolding exists; no platform drivers are production-grade yet.

For today, **treat Postiz as mandatory for the social execution pipeline**. Gateway and direct-API paths are placeholders you can expand if/when Postiz becomes a constraint (cost, rate limits, platform coverage gaps). The architecture is set up so a new backend only needs to:
1. Extend `BaseDriver` with a `publishViaXxx` implementation
2. Expose credentials through `getBackendSources()` in `src/api/handler.ts`
3. Register itself on the driver

Until that expansion happens, assume Postiz is the only supported publish path.

---

## Troubleshooting

**Handoff picker shows "Loading…" then nothing**
→ Plugin isn't installed on the team whose workflow you're editing. Enable `marketing` on that team.

**Handoff picker shows "No accounts found"**
→ Plugin is installed but Postiz isn't connected for that team. Open the Accounts tab → Save & Detect.

**Handoff picker shows only one of the Instagram accounts**
→ Your Kitchen `.next` bundle is pre-Apr-19. The canonical-platform grouping that collapses `instagram` + `instagram-standalone` into one picker is in ClawKitchen PR #399. Rebuild and redeploy Kitchen.

**Post publishes to the wrong Instagram account**
→ The handoff's `integrationIds` selection was empty. Without explicit selection, the first connected account for that platform is used. Pin the intended account(s) in the handoff node picker.

**Publish fails with Postiz `__type` mismatch**
→ Variant awareness isn't reaching the Postiz client. Confirm `BaseDriver.publishViaPostiz` is running the current kitchen-plugin-marketing build (`dist/` in sync with `src/`).

---

## References

- Plugin repo: https://github.com/JIGGAI/kitchen-plugin-marketing
- Editor picker PR: https://github.com/JIGGAI/ClawKitchen/pull/399
- Example workflows: `~/.openclaw/workspace-hmx-*/shared-context/workflows/`
