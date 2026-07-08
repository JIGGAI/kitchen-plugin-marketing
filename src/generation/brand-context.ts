import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const BRAND_PATH = join(
  homedir(),
  '.openclaw',
  'workspace-hmx-marketing-team',
  'BRAND.md',
);

const SECTION_PREFIXES = [
  '## 2. Brand position',
  '## 6. Brand archetype',
  '## 7. Brand personality',
  '## 17. Imagery rules',
  '## 19. Visual cues',
];

// Extract the sections that describe the look-and-feel of Hair Mechanix so we
// can prepend them to generation prompts. Sections were chosen for visual /
// aesthetic relevance — voice-only sections (§9, §10, §11) don't help image or
// video generation prompts. Total budget is roughly 1–2k tokens.
export function extractBrandVisualPreamble(source?: string): string {
  const content = source ?? readBrandFile();
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
  return [
    '[Brand context — Hair Mechanix visual guidelines. The generated image or video should reflect these.]',
    '',
    chunks.join('\n\n'),
    '',
    '[End brand context — user prompt follows]',
    '',
    '',
  ].join('\n');
}

function readBrandFile(): string {
  try {
    if (!existsSync(BRAND_PATH)) return '';
    return readFileSync(BRAND_PATH, 'utf8');
  } catch {
    return '';
  }
}

export function applyBrandContext(prompt: string, includeBrand: boolean | undefined): string {
  if (!includeBrand) return prompt;
  const preamble = extractBrandVisualPreamble();
  if (!preamble) return prompt;
  return `${preamble}${prompt}`;
}

export function getBrandFilePath(): string {
  return BRAND_PATH;
}
