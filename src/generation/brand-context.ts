import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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

// Kling video API caps the prompt at 2500 chars (HTTP 400 code 1201). Gemini
// image generation doesn't have a documented hard cap but starts returning
// empty candidates when the prompt is dense with unrelated context. We aim
// well under both.
const BRAND_SUFFIX_MAX_CHARS = 1400;

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

export function buildBrandStyleSuffix(teamId?: string): string {
  const brand = readSafely(brandPathFor(teamId));
  const voice = readSafely(brandVoicePathFor(teamId));

  const visualWorld = firstBullets(brand, VISUAL_WORLD_SECTIONS);
  const avoidVisually = firstBullets(brand, AVOID_VISUALLY_SECTIONS);
  const visualCues = firstBullets(brand, VISUAL_CUES_SECTIONS);
  const voiceWords = firstBullets(voice, VOICE_WORDS_SECTIONS);
  const preferredTone = firstBullets(voice, PREFERRED_TONE_SECTIONS);

  // Nothing usable found (missing docs, or a layout none of the candidates
  // match) — return empty so applyBrandContext leaves the prompt untouched
  // rather than appending a bare, meaningless header.
  if (!visualWorld.length && !visualCues.length && !voiceWords.length
      && !preferredTone.length && !avoidVisually.length) {
    return '';
  }

  const lines: string[] = [`Brand style (${brandLabelFrom(brand, teamId)}):`];
  if (visualWorld.length) lines.push(`- Visual world: ${visualWorld.join(', ')}.`);
  if (visualCues.length) lines.push(`- Visual cues: ${visualCues.join('; ')}.`);
  if (voiceWords.length || preferredTone.length) {
    const mood = [...voiceWords, ...preferredTone].join(', ');
    lines.push(`- Mood: ${mood}.`);
  }
  if (avoidVisually.length) lines.push(`- Avoid: ${avoidVisually.join(', ')}.`);

  let suffix = lines.join('\n');
  if (suffix.length > BRAND_SUFFIX_MAX_CHARS) {
    suffix = suffix.slice(0, BRAND_SUFFIX_MAX_CHARS - 1).trimEnd() + '…';
  }
  return suffix;
}

// Prepend the user's prompt with the brand style suffix. User prompt goes
// FIRST so the generation model sees the concrete goal before the style
// constraints — model output quality is materially better this way, and any
// downstream truncation preserves the important part.
export function applyBrandContext(
  prompt: string,
  includeBrand: boolean | undefined,
  teamId?: string,
): string {
  if (!includeBrand) return prompt;
  const suffix = buildBrandStyleSuffix(teamId);
  if (!suffix) return prompt;
  return `${prompt}\n\n${suffix}`;
}

export function getBrandFilePath(teamId?: string): string {
  return brandPathFor(teamId);
}
export function getBrandVoiceFilePath(teamId?: string): string {
  return brandVoicePathFor(teamId);
}
