import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const WORKSPACE = join(homedir(), '.openclaw', 'workspace-hmx-marketing-team');
const BRAND_PATH = join(WORKSPACE, 'BRAND.md');
const BRAND_VOICE_PATH = join(WORKSPACE, 'shared-context', 'brand-voice.md');

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
export function buildBrandStyleSuffix(): string {
  const brand = readSafely(BRAND_PATH);
  const voice = readSafely(BRAND_VOICE_PATH);

  const visualWorld = extractBullets(extractSection(extractSection(brand, '## 17. Imagery rules'), '### Visual world'));
  const avoidVisually = extractBullets(extractSection(extractSection(brand, '## 17. Imagery rules'), '### Avoid visually'));
  const visualCues = extractBullets(extractSection(brand, '## 19. Visual cues'));
  const voiceWords = extractBullets(extractSection(voice, '## Voice words'));
  const preferredTone = extractBullets(extractSection(voice, '## Preferred tone'));

  const lines: string[] = ['Brand style (Hair Mechanix):'];
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
export function applyBrandContext(prompt: string, includeBrand: boolean | undefined): string {
  if (!includeBrand) return prompt;
  const suffix = buildBrandStyleSuffix();
  if (!suffix) return prompt;
  return `${prompt}\n\n${suffix}`;
}

export function getBrandFilePath(): string {
  return BRAND_PATH;
}
export function getBrandVoiceFilePath(): string {
  return BRAND_VOICE_PATH;
}
