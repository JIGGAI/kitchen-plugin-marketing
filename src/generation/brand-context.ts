import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { resolveSectionSelection } from './brand-sections';

// Resolve the workspace whose brand docs seed generation.
//
// This used to be hardcoded to the Hair Mechanix team. On a second
// deployment — different team, same machine layout — that silently seeded
// every prompt with the *other* client's brand, because the leftover
// workspace-hmx-marketing-team directory was still on disk and still had
// the sections below. Resolve per-team instead. Order: explicit override,
// then the requesting team's own workspace, then the legacy path so
// existing single-team installs behave exactly as before.
const LEGACY_WORKSPACE_TEAM = 'hmx-marketing-team';

export function workspaceFor(teamId?: string): string {
  const override = process.env.MARKETING_BRAND_WORKSPACE;
  if (override) return override;
  const root = join(homedir(), '.openclaw');
  if (teamId) {
    const perTeam = join(root, `workspace-${teamId}`);
    if (existsSync(perTeam)) return perTeam;
  }
  return join(root, `workspace-${LEGACY_WORKSPACE_TEAM}`);
}

function brandPathFor(teamId?: string): string {
  return join(workspaceFor(teamId), 'BRAND.md');
}
function brandVoicePathFor(teamId?: string): string {
  return join(workspaceFor(teamId), 'shared-context', 'brand-voice.md');
}

// Brand books aren't laid out identically across deployments, so each field
// lists candidate section paths (outer section, optional nested subsection).
// The first candidate that yields bullets wins — which keeps the Hair
// Mechanix layout producing byte-identical output while letting other teams
// use their own structure.
type SectionPath = [string] | [string, string];

const VISUAL_WORLD_SECTIONS: SectionPath[] = [
  ['## 17. Imagery rules', '### Visual world'],
  ['## Shared Visual Character'],
];
const AVOID_VISUALLY_SECTIONS: SectionPath[] = [
  ['## 17. Imagery rules', '### Avoid visually'],
];
const VISUAL_CUES_SECTIONS: SectionPath[] = [
  ['## 19. Visual cues'],
  ['## Current Visual Signals'],
  ['## Food Photography'],
];
const VOICE_WORDS_SECTIONS: SectionPath[] = [
  ['## Voice words'],
  ['## Voice Standard', '### The Voice Is'],
];
const PREFERRED_TONE_SECTIONS: SectionPath[] = [
  ['## Preferred tone'],
];

// Some brand books cover multiple venues under one workspace, each with its
// own — and often mutually exclusive — imagery rules. Woods is the case that
// drove this: Oakwood must avoid lake/waterfront imagery while Driftwood is
// defined by it, so blending both would be incoherent. Variants are
// discovered from the document rather than hardcoded, so a book without
// them (Hair Mechanix) simply reports none and behaves as before.
const VARIANT_HEADING = /^##\s+(.+?)\s+Imagery Rules\s*$/;

export type BrandScene = 'fromScratch' | 'fromSource';

// Some parts of a brand book are too important to leave to the model's own
// section pick — if "what our shop looks like" or "who is on camera" is the
// line that gets dropped, the image is wrong in a way no other section can
// compensate for. These are pinned: always contributed, in a fixed order.
//
// Each is matched on the heading's wording rather than a fixed path — the same
// approach as the variant blocks — so a book that renames "Shop environment"
// to "Our Space" keeps working, and a book with no such section contributes
// nothing and behaves exactly as it did before.
//
// `scenes` is what differs between them:
//   setting  — from a text prompt alone the model has to be told what the room
//              looks like or it invents a generic one; when editing an existing
//              photo the photo already IS the room, and restating it fights the
//              source, which is what content-ops-defaults ("do NOT describe the
//              interior") forbids.
//   casting  — both paths. The people are always ours to direct, and an edit is
//              usually being asked to change exactly who is in frame.
const PINNED_SECTIONS: { label: string; match: RegExp; scenes: BrandScene[] }[] = [
  {
    label: 'Casting',
    // "cast"/"casting"/"talent"/"subjects"/"people". Woods' "## People and
    // Atmosphere" is casting and conduct rules and is correctly caught here.
    match: /\b(casting|cast|talent|subjects?|people|on[-\s]?camera)\b/i,
    scenes: ['fromScratch', 'fromSource'],
  },
  {
    label: 'Setting',
    // Words that only ever name a physical place. "Atmosphere" and "scene"
    // were tried and pulled back out — they collide with casting sections —
    // and a bare "shop"/"store" match would swallow "Store hours".
    match: /\b(environment|interior|setting|backdrop|surroundings|decor|décor|venue|premises|storefront|space|room|shop\s*floor|dining\s*room)\b/i,
    scenes: ['fromScratch'],
  },
];

// Every heading matching any pinned category, whatever the scene. Used for
// stripping, so a pinned section can never also arrive through the generic
// extraction path.
function findPinnedHeadings(brand: string): string[] {
  const out: string[] = [];
  for (const line of brand.split('\n')) {
    // H2/H3 only — extractSection's level detection understands those two.
    if (!/^#{2,3}\s/.test(line)) continue;
    if (VARIANT_HEADING.test(line)) continue;
    if (PINNED_SECTIONS.some((s) => s.match.test(line))) out.push(line.trim());
  }
  return out;
}

// Remove every pinned section from the document. Skipping the heading at
// selection time is not enough on its own: a model asked which sections matter
// reasonably answers with the PARENT ("## 17. Imagery rules"), and extracting
// that returns the pinned bullets nested underneath it. Cutting them out of
// the source text closes every route at once.
function stripPinnedSections(brand: string): string {
  const headings = new Set(findPinnedHeadings(brand));
  if (!headings.size) return brand;
  const out: string[] = [];
  let skippingLevel = 0;
  for (const line of brand.split('\n')) {
    if (skippingLevel) {
      const m = line.match(/^(#{1,6})\s/);
      // Any heading at the same level or higher ends the skipped block.
      if (m && m[1].length <= skippingLevel) skippingLevel = 0;
      else continue;
    }
    if (headings.has(line.trim())) {
      skippingLevel = (line.match(/^(#{1,6})\s/) as RegExpMatchArray)[1].length;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// The pinned lines for a scene: one `- <Label>: …` per category that has any
// content, in PINNED_SECTIONS order. A category with no matching heading, or
// one that doesn't apply to this scene, contributes nothing.
function pinnedLines(brand: string, scene: BrandScene): string[] {
  // First match wins, so a heading like "## People and Setting" lands in one
  // category instead of being emitted twice.
  const byLabel = new Map<string, string[]>();
  for (const heading of findPinnedHeadings(brand)) {
    const section = PINNED_SECTIONS.find((s) => s.match.test(heading));
    if (!section) continue;
    const bullets = extractBullets(extractSection(brand, heading));
    if (!bullets.length) continue;
    byLabel.set(section.label, (byLabel.get(section.label) || []).concat(bullets));
  }
  const lines: string[] = [];
  for (const section of PINNED_SECTIONS) {
    if (!section.scenes.includes(scene)) continue;
    const bullets = byLabel.get(section.label);
    if (bullets?.length) lines.push(`- ${section.label}: ${bullets.join('; ')}.`);
  }
  return lines;
}

export function listBrandVariants(teamId?: string): string[] {
  const brand = readSafely(brandPathFor(teamId));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of brand.split('\n')) {
    const m = line.match(VARIANT_HEADING);
    if (m) {
      const name = m[1].trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

// Kling video API caps the prompt at 2500 chars (HTTP 400 code 1201). Gemini
// image generation doesn't have a documented hard cap but starts returning
// empty candidates when the prompt is dense with unrelated context. We aim
// well under both.
// The ceiling is a video constraint, not a general one: Kling's API rejects a
// prompt over 2500 chars (HTTP 400 code 1201), so the suffix has to leave room
// for the user's own text. Gemini image generation has no documented cap — it
// only degrades when a prompt is dense with *irrelevant* context, which brand
// rules are not. Capping images at the video limit is what silently ate the
// "Avoid" line once casting and setting were both pinned.
const BRAND_SUFFIX_MAX_CHARS_VIDEO = 1400;
const BRAND_SUFFIX_MAX_CHARS_IMAGE = 2400;

function maxSuffixChars(type?: 'image' | 'video'): number {
  return type === 'video' ? BRAND_SUFFIX_MAX_CHARS_VIDEO : BRAND_SUFFIX_MAX_CHARS_IMAGE;
}

// Trim to fit by dropping whole lines off the end, so an over-long suffix
// loses its least important instruction rather than ending mid-sentence.
// Lines are emitted most-important-first for exactly this reason.
function capSuffix(lines: string[], max: number): string {
  const kept = [...lines];
  while (kept.length > 1 && kept.join('\n').length > max) kept.pop();
  const out = kept.join('\n');
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

// Extract a specific H2 or H3 subsection (from `## Name` or `### Name` to
// the next same-or-higher heading). Returns the body only — the header line
// itself is dropped.
function extractSection(source: string, headerLine: string): string {
  if (!source) return '';
  const level = headerLine.startsWith('### ') ? 3 : 2;
  const lines = source.split('\n');
  const out: string[] = [];
  let capturing = false;
  for (const line of lines) {
    if (capturing) {
      // Stop at any heading of equal or higher level (H2 breaks H2 and H3,
      // H3 only breaks another H3 — H4+ stay inside).
      if (line.startsWith('# ') || line.startsWith('## ')) break;
      if (level === 3 && line.startsWith('### ')) break;
      out.push(line);
    } else if (line.startsWith(headerLine)) {
      capturing = true;
    }
  }
  return out.join('\n').trim();
}

// Grab the leading bullets from a block of text — lines starting with `-`
// or `*` up until the first non-bullet, non-blank line.
function extractBullets(section: string): string[] {
  const bullets: string[] = [];
  let inList = false;
  for (const raw of section.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('- ') || line.startsWith('* ')) {
      inList = true;
      bullets.push(line.slice(2).trim());
    } else if (inList && line === '') {
      // stop at the first blank line after we started listing
      break;
    }
  }
  return bullets;
}

function readSafely(p: string): string {
  try {
    if (!existsSync(p)) return '';
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

// Build a compact style suffix drawn from BRAND.md §17 (Imagery rules) + §19
// (Visual cues) + brand-voice.md (Voice words + Preferred tone). Chosen for
// visual-generation relevance and to keep total budget under 2500 chars
// including the user's own prompt.
// Try each candidate section path in order; return the first that yields
// bullets. Empty array when none of them match this document's layout.
function firstBullets(source: string, candidates: SectionPath[]): string[] {
  for (const path of candidates) {
    let section = extractSection(source, path[0]);
    if (path.length === 2) section = extractSection(section, path[1]);
    const bullets = extractBullets(section);
    if (bullets.length) return bullets;
  }
  return [];
}

// Label the suffix with the brand the docs actually describe, taken from the
// BRAND.md H1 ("# Hair Mechanix Brand Guide" -> "Hair Mechanix", "# Woods
// Brand Book" -> "Woods"). Previously hardcoded, which meant a second
// deployment announced itself as Hair Mechanix in every prompt.
export function brandLabelFrom(brand: string, teamId?: string): string {
  const h1 = brand.split('\n').find((l) => l.startsWith('# '));
  if (h1) {
    const cleaned = h1.replace(/^#\s+/, '').replace(/\s+Brand\s+(Guide|Book).*$/i, '').trim();
    if (cleaned) return cleaned;
  }
  return teamId || 'Brand';
}

// Compose the suffix label. Once a deployment splits into one book per
// venue, the book's own name and the variant are the same word — labelling
// that "Oakwood — Oakwood" reads like a bug in every prompt. Collapse it.
export function composeBrandLabel(base: string, variant?: string | false | null): string {
  if (!variant) return base;
  if (base.trim().toLowerCase() === String(variant).trim().toLowerCase()) return base;
  return `${base} — ${variant}`;
}

export function buildBrandStyleSuffix(
  teamId?: string,
  variant?: string,
  scene: BrandScene = 'fromScratch',
  type?: 'image' | 'video',
): string {
  const brandRaw = readSafely(brandPathFor(teamId));
  const voice = readSafely(brandVoicePathFor(teamId));

  // Pinned sections are contributed once, explicitly, from the raw document;
  // every other extraction runs against a copy with those sections removed so
  // they can never arrive twice or leak in via a parent heading.
  const pinned = pinnedLines(brandRaw, scene);
  const brand = stripPinnedSections(brandRaw);
  const visualWorld = firstBullets(brand, VISUAL_WORLD_SECTIONS);
  const avoidVisually = firstBullets(brand, AVOID_VISUALLY_SECTIONS);
  const visualCues = firstBullets(brand, VISUAL_CUES_SECTIONS);
  const voiceWords = firstBullets(voice, VOICE_WORDS_SECTIONS);
  const preferredTone = firstBullets(voice, PREFERRED_TONE_SECTIONS);

  // Only honour a variant the document actually defines, so a stale or
  // hand-crafted value can't inject an arbitrary heading lookup.
  let variantShow: string[] = [];
  let variantAvoid: string[] = [];
  const resolvedVariant = variant && listBrandVariants(teamId)
    .find((v) => v.toLowerCase() === variant.trim().toLowerCase());
  if (resolvedVariant) {
    const block = extractSection(brand, `## ${resolvedVariant} Imagery Rules`);
    variantShow = extractBullets(extractSection(block, '### Show'));
    variantAvoid = extractBullets(extractSection(block, '### Avoid'));
  }

  // Nothing usable found (missing docs, or a layout none of the candidates
  // match) — return empty so applyBrandContext leaves the prompt untouched
  // rather than appending a bare, meaningless header.
  if (!visualWorld.length && !visualCues.length && !voiceWords.length
      && !preferredTone.length && !avoidVisually.length
      && !variantShow.length && !variantAvoid.length && !pinned.length) {
    return '';
  }

  const label = composeBrandLabel(brandLabelFrom(brand, teamId), resolvedVariant);
  // Pinned sections lead: they are the most load-bearing instructions here,
  // and leading means they survive the char cap at the bottom.
  const lines: string[] = [`Brand style (${label}):`, ...pinned];
  // Variant rules lead: they are the most specific guidance available, and
  // if the suffix hits the char cap the generic lines are the ones to lose.
  if (variantShow.length) lines.push(`- Show: ${variantShow.join('; ')}.`);
  if (variantAvoid.length) lines.push(`- Never show: ${variantAvoid.join('; ')}.`);
  if (visualWorld.length) lines.push(`- Visual world: ${visualWorld.join(', ')}.`);
  if (visualCues.length) lines.push(`- Visual cues: ${visualCues.join('; ')}.`);
  if (voiceWords.length || preferredTone.length) {
    const mood = [...voiceWords, ...preferredTone].join(', ');
    lines.push(`- Mood: ${mood}.`);
  }
  if (avoidVisually.length) lines.push(`- Avoid: ${avoidVisually.join(', ')}.`);

  return capSuffix(lines, maxSuffixChars(type));
}

// Prepend the user's prompt with the brand style suffix. User prompt goes
// FIRST so the generation model sees the concrete goal before the style
// constraints — model output quality is materially better this way, and any
// downstream truncation preserves the important part.
// Compose a suffix from an explicit heading list (the model-selected path).
// Each selected section contributes `- <Heading>: <its bullets>`, keeping
// document order so the brand book's own emphasis survives. Sections with no
// bullets are skipped rather than emitting an empty label.
function buildFromHeadings(brand: string, headings: string[]): string[] {
  const lines: string[] = [];
  for (const heading of headings) {
    // Variant-scoped content is handled by the variant mechanism and must
    // never come through here. A model asked "which sections matter for
    // imagery?" reasonably picks every venue's imagery rules — but emitting
    // them all produces a self-contradicting suffix (forbidding lake imagery
    // for Oakwood on one line while supplying Driftwood's lake rules on the
    // next). Skip both the `## <Name> Imagery Rules` blocks and their
    // repeated `### Show` / `### Avoid` children.
    if (VARIANT_HEADING.test(heading)) continue;
    if (/^###\s+(Show|Avoid)\s*$/i.test(heading)) continue;
    const bullets = extractBullets(extractSection(brand, heading));
    if (!bullets.length) continue;
    const title = heading.replace(/^#+\s*/, '').trim();
    lines.push(`- ${title}: ${bullets.join('; ')}.`);
  }
  return lines;
}

/**
 * Model-selected variant of buildBrandStyleSuffix. Falls back to the
 * heuristic section candidates whenever a selection isn't available, so
 * generation never depends on the model call succeeding.
 */
export async function buildBrandStyleSuffixAsync(
  teamId?: string,
  variant?: string,
  scene: BrandScene = 'fromScratch',
  type?: 'image' | 'video',
): Promise<string> {
  const workspace = workspaceFor(teamId);
  const brandRaw = readSafely(brandPathFor(teamId));
  const voice = readSafely(brandVoicePathFor(teamId));
  if (!brandRaw && !voice) return '';

  // Selection is keyed on the raw document so the cache hash is the same
  // whichever scene asks for it.
  const selection = await resolveSectionSelection(workspace, brandRaw).catch(() => null);
  if (!selection) return buildBrandStyleSuffix(teamId, variant, scene, type);

  const resolvedVariant = variant && listBrandVariants(teamId)
    .find((v) => v.toLowerCase() === variant.trim().toLowerCase());

  const brand = stripPinnedSections(brandRaw);
  const lines: string[] = [...pinnedLines(brandRaw, scene)];
  if (resolvedVariant) {
    const block = extractSection(brand, `## ${resolvedVariant} Imagery Rules`);
    const show = extractBullets(extractSection(block, '### Show'));
    const avoid = extractBullets(extractSection(block, '### Avoid'));
    if (show.length) lines.push(`- Show: ${show.join('; ')}.`);
    if (avoid.length) lines.push(`- Never show: ${avoid.join('; ')}.`);
  }
  lines.push(...buildFromHeadings(brand, selection.headings));

  const voiceWords = firstBullets(voice, VOICE_WORDS_SECTIONS);
  const preferredTone = firstBullets(voice, PREFERRED_TONE_SECTIONS);
  if (voiceWords.length || preferredTone.length) {
    lines.push(`- Mood: ${[...voiceWords, ...preferredTone].join(', ')}.`);
  }

  if (!lines.length) return '';

  const label = composeBrandLabel(brandLabelFrom(brand, teamId), resolvedVariant);
  return capSuffix([`Brand style (${label}):`, ...lines], maxSuffixChars(type));
}

export async function applyBrandContext(
  prompt: string,
  includeBrand: boolean | undefined,
  teamId?: string,
  variant?: string,
  scene: BrandScene = 'fromScratch',
  type?: 'image' | 'video',
): Promise<string> {
  if (!includeBrand) return prompt;
  const suffix = await buildBrandStyleSuffixAsync(teamId, variant, scene, type);
  if (!suffix) return prompt;
  return `${prompt}\n\n${suffix}`;
}

export function getBrandFilePath(teamId?: string): string {
  return brandPathFor(teamId);
}
export function getBrandVoiceFilePath(teamId?: string): string {
  return brandVoicePathFor(teamId);
}
