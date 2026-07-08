import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const WORKSPACE = join(homedir(), '.openclaw', 'workspace-hmx-marketing-team');
const BRAND_PATH = join(WORKSPACE, 'BRAND.md');
const BRAND_VOICE_PATH = join(WORKSPACE, 'shared-context', 'brand-voice.md');

const SECTION_PREFIXES = [
  '## 2. Brand position',
  '## 6. Brand archetype',
  '## 7. Brand personality',
  '## 17. Imagery rules',
  '## 19. Visual cues',
];

// Extract the sections of BRAND.md that describe the look-and-feel of Hair
// Mechanix so we can prepend them to generation prompts. Sections were
// chosen for visual / aesthetic relevance. Voice-only text is loaded from
// brand-voice.md instead — it steers alt text / caption tone in downstream
// consumers but doesn't drive the image / video itself.
export function extractBrandVisualPreamble(source?: string): string {
  const content = source ?? readSafely(BRAND_PATH);
  if (!content) return '';

  const lines = content.split('\n');
  const chunks: string[] = [];
  let currentSection = '';
  let capturing = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (capturing && currentSection) {
        chunks.push(currentSection.trimEnd());
        currentSection = '';
      }
      capturing = SECTION_PREFIXES.some((prefix) => line.startsWith(prefix));
      if (capturing) currentSection = line + '\n';
    } else if (capturing) {
      currentSection += line + '\n';
    }
  }
  if (capturing && currentSection) chunks.push(currentSection.trimEnd());

  if (chunks.length === 0) return '';
  return chunks.join('\n\n');
}

// Read brand-voice.md in full. The file is authored to be prompt-ready
// (short, opinionated, no boilerplate) so we ship it whole rather than
// slicing sections out of it.
export function readBrandVoice(): string {
  return readSafely(BRAND_VOICE_PATH);
}

function readSafely(p: string): string {
  try {
    if (!existsSync(p)) return '';
    return readFileSync(p, 'utf8').trim();
  } catch {
    return '';
  }
}

export function applyBrandContext(prompt: string, includeBrand: boolean | undefined): string {
  if (!includeBrand) return prompt;
  const visualPreamble = extractBrandVisualPreamble();
  const voice = readBrandVoice();
  if (!visualPreamble && !voice) return prompt;

  const parts: string[] = [];
  parts.push('[Brand context — Hair Mechanix. The generated image or video should reflect these.]');
  parts.push('');
  if (visualPreamble) {
    parts.push(visualPreamble);
    parts.push('');
  }
  if (voice) {
    parts.push('## Brand voice');
    parts.push('');
    parts.push(voice);
    parts.push('');
  }
  parts.push('[End brand context — user prompt follows]');
  parts.push('');
  parts.push('');

  return parts.join('\n') + prompt;
}

export function getBrandFilePath(): string {
  return BRAND_PATH;
}
export function getBrandVoiceFilePath(): string {
  return BRAND_VOICE_PATH;
}
