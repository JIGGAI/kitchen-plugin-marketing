import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildBrandStyleSuffix, applyBrandContext, brandLabelFrom, buildBrandStyleSuffixAsync, listBrandVariants } from '../brand-context';

// Each case builds a throwaway workspace and points the resolver at it via
// MARKETING_BRAND_WORKSPACE, so nothing here depends on what's installed on
// the machine running the tests.
const made: string[] = [];

// Never let the suite make a live model call: these cases exercise the
// deterministic fallback path. The model-selected path is covered separately
// via a pre-seeded cache.
process.env.MARKETING_BRAND_SECTIONS = 'off';

function workspace(brand: string, voice: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'brandctx-'));
  made.push(dir);
  writeFileSync(join(dir, 'BRAND.md'), brand, 'utf8');
  mkdirSync(join(dir, 'shared-context'), { recursive: true });
  writeFileSync(join(dir, 'shared-context', 'brand-voice.md'), voice, 'utf8');
  process.env.MARKETING_BRAND_WORKSPACE = dir;
  return dir;
}

afterEach(() => {
  delete process.env.MARKETING_BRAND_WORKSPACE;
  while (made.length) rmSync(made.pop()!, { recursive: true, force: true });
});

const HMX_BRAND = `# Hair Mechanix Brand Guide

## 17. Imagery rules

### Visual world
- dark premium base
- gold accents

### Avoid visually
- pastel palettes

## 19. Visual cues
- barber pole
`;

const HMX_VOICE = `# Voice

## Voice words
- confident
- direct

## Preferred tone
- assured
`;

// Deliberately mirrors the Woods brand book's real layout: no numbered
// "Imagery rules" section, voice nested under a Voice Standard heading.
const WOODS_BRAND = `---
document: BRAND.md
---

# Woods Brand Book

## Shared Visual Character
- warm wood tones
- natural light

## Current Visual Signals
- lakeside dusk
`;

const WOODS_VOICE = `# Woods Brand Voice — Runtime Field Card

## Voice Standard

### The Voice Is
- warm
- unpretentious
`;

describe('brand-context per-team resolution', () => {
  it('keeps the Hair Mechanix layout working and labels it from the H1', () => {
    workspace(HMX_BRAND, HMX_VOICE);
    const suffix = buildBrandStyleSuffix('hmx-marketing-team');
    expect(suffix).toContain('Brand style (Hair Mechanix):');
    expect(suffix).toContain('Visual world: dark premium base, gold accents.');
    expect(suffix).toContain('Visual cues: barber pole.');
    expect(suffix).toContain('Mood: confident, direct, assured.');
    expect(suffix).toContain('Avoid: pastel palettes.');
  });

  it('extracts from a differently-structured brand book and labels it correctly', () => {
    workspace(WOODS_BRAND, WOODS_VOICE);
    const suffix = buildBrandStyleSuffix('woods-team');
    // The bug this guards: it previously said "Hair Mechanix" here.
    expect(suffix).toContain('Brand style (Woods):');
    expect(suffix).not.toContain('Hair Mechanix');
    expect(suffix).toContain('warm wood tones');
    expect(suffix).toContain('lakeside dusk');
    expect(suffix).toContain('warm, unpretentious');
  });

  it('returns empty rather than a bare header when no section matches', () => {
    workspace('# Some Brand\n\n## Unrelated\ntext\n', '# Voice\n\n## Nothing\ntext\n');
    expect(buildBrandStyleSuffix('some-team')).toBe('');
  });

  it('returns empty when the brand docs are missing entirely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brandctx-empty-'));
    made.push(dir);
    process.env.MARKETING_BRAND_WORKSPACE = dir;
    expect(buildBrandStyleSuffix('missing-team')).toBe('');
  });

  it('leaves the prompt untouched when nothing usable is found', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brandctx-empty2-'));
    made.push(dir);
    process.env.MARKETING_BRAND_WORKSPACE = dir;
    expect(await applyBrandContext('a photo of a burger', true, 'missing-team')).toBe('a photo of a burger');
  });

  it('leaves the prompt untouched when the caller did not opt in', async () => {
    workspace(WOODS_BRAND, WOODS_VOICE);
    expect(await applyBrandContext('a photo of a burger', false, 'woods-team')).toBe('a photo of a burger');
  });

  it('puts the user prompt before the style suffix', async () => {
    workspace(WOODS_BRAND, WOODS_VOICE);
    const out = await applyBrandContext('a photo of a burger', true, 'woods-team');
    expect(out.indexOf('a photo of a burger')).toBeLessThan(out.indexOf('Brand style'));
  });
});

describe('brandLabelFrom', () => {
  it('strips the Brand Guide / Brand Book suffix', () => {
    expect(brandLabelFrom('# Hair Mechanix Brand Guide\n')).toBe('Hair Mechanix');
    expect(brandLabelFrom('# Woods Brand Book\n')).toBe('Woods');
  });

  it('falls back to the team id when there is no H1', () => {
    expect(brandLabelFrom('no heading here', 'woods-team')).toBe('woods-team');
  });
});

// A book covering two venues whose imagery rules directly contradict each
// other — the reason a single blended suffix isn't good enough.
const MULTI_BRAND = `# Woods Brand Book

## Shared Visual Character
- warm wood tones

## Driftwood Imagery Rules

### Show
- The real Walled Lake view

### Avoid
- Ocean, beach, tropical, palm-tree, or resort imagery

## Oakwood Imagery Rules

### Show
- The real Oakwood interior and exterior

### Avoid
- Lake, dock, boating, beach, or waterfront imagery
`;

describe('brand variants', () => {
  it('discovers variants from the document instead of hardcoding them', () => {
    workspace(MULTI_BRAND, WOODS_VOICE);
    expect(listBrandVariants('woods-team')).toEqual(['Driftwood', 'Oakwood']);
  });

  it('reports no variants for a book that does not define any', () => {
    workspace(HMX_BRAND, HMX_VOICE);
    expect(listBrandVariants('hmx-marketing-team')).toEqual([]);
  });

  it('applies only the selected venue rules, never the other venue', () => {
    workspace(MULTI_BRAND, WOODS_VOICE);
    const oak = buildBrandStyleSuffix('woods-team', 'Oakwood');
    expect(oak).toContain('Brand style (Woods — Oakwood):');
    expect(oak).toContain('The real Oakwood interior and exterior');
    expect(oak).toContain('Never show: Lake, dock, boating');
    // The bug this guards: Driftwood's lake-positive rule leaking into Oakwood.
    expect(oak).not.toContain('The real Walled Lake view');
  });

  it('keeps the two venues separate in the other direction too', () => {
    workspace(MULTI_BRAND, WOODS_VOICE);
    const drift = buildBrandStyleSuffix('woods-team', 'Driftwood');
    expect(drift).toContain('The real Walled Lake view');
    expect(drift).not.toContain('The real Oakwood interior');
  });

  it('ignores a variant the document does not define', () => {
    workspace(MULTI_BRAND, WOODS_VOICE);
    const out = buildBrandStyleSuffix('woods-team', 'NotARealVenue');
    expect(out).toContain('Brand style (Woods):');
    expect(out).not.toContain('Never show:');
  });

  it('matches the variant case-insensitively', () => {
    workspace(MULTI_BRAND, WOODS_VOICE);
    expect(buildBrandStyleSuffix('woods-team', 'oakwood')).toContain('Woods — Oakwood');
  });
});

describe('model-selected sections (served from cache, no live call)', () => {
  it('uses the cached heading selection and honours document order', async () => {
    delete process.env.MARKETING_BRAND_SECTIONS; // exercise the selected path
    const brand = `# Woods Brand Book

## Strategy Notes
- not relevant to imagery

## Logos and Brand Assets
- Never redraw, retype, restyle, or AI-recreate a logo

## Do Not Invent
- Never invent ingredients, sides, garnishes, glassware, or serving pieces
`;
    const dir = workspace(brand, WOODS_VOICE);
    // Pre-seed the cache so resolveSectionSelection returns without any HTTP.
    const { hashDocument } = await import('../brand-sections');
    writeFileSync(
      join(dir, 'shared-context', '.brand-section-cache.json'),
      JSON.stringify({
        [hashDocument(brand)]: {
          headings: ['## Logos and Brand Assets', '## Do Not Invent'],
          hash: hashDocument(brand),
          model: 'test',
          at: new Date().toISOString(),
        },
      }),
      'utf8',
    );
    const suffix = await buildBrandStyleSuffixAsync('woods-team');
    expect(suffix).toContain('Logos and Brand Assets: Never redraw');
    expect(suffix).toContain('Do Not Invent: Never invent ingredients');
    // Sections the model did not pick stay out.
    expect(suffix).not.toContain('not relevant to imagery');
    process.env.MARKETING_BRAND_SECTIONS = 'off';
  });

  it('falls back to heuristics when selection is unavailable', async () => {
    workspace(WOODS_BRAND, WOODS_VOICE);
    const suffix = await buildBrandStyleSuffixAsync('woods-team');
    expect(suffix).toContain('Visual world: warm wood tones');
  });
});

describe('variant blocks never leak through model selection', () => {
  it('drops venue imagery blocks the model picked, keeping only the chosen venue', async () => {
    delete process.env.MARKETING_BRAND_SECTIONS;
    const dir = workspace(MULTI_BRAND, WOODS_VOICE);
    const { hashDocument } = await import('../brand-sections');
    // Exactly what the live model returned: both venues' blocks selected.
    writeFileSync(
      join(dir, 'shared-context', '.brand-section-cache.json'),
      JSON.stringify({
        [hashDocument(MULTI_BRAND)]: {
          headings: [
            '## Shared Visual Character',
            '## Driftwood Imagery Rules',
            '## Oakwood Imagery Rules',
          ],
          hash: hashDocument(MULTI_BRAND),
          model: 'test',
          at: new Date().toISOString(),
        },
      }),
      'utf8',
    );
    const oak = await buildBrandStyleSuffixAsync('woods-team', 'Oakwood');
    expect(oak).toContain('The real Oakwood interior and exterior');
    expect(oak).toContain('Never show: Lake, dock, boating');
    // The contradiction this guards against.
    expect(oak).not.toContain('The real Walled Lake view');
    expect(oak).not.toContain('Driftwood Imagery Rules');
    expect(oak).toContain('Shared Visual Character: warm wood tones');
    process.env.MARKETING_BRAND_SECTIONS = 'off';
  });

  it('omits venue rules entirely when no variant was chosen', async () => {
    delete process.env.MARKETING_BRAND_SECTIONS;
    const dir = workspace(MULTI_BRAND, WOODS_VOICE);
    const { hashDocument } = await import('../brand-sections');
    writeFileSync(
      join(dir, 'shared-context', '.brand-section-cache.json'),
      JSON.stringify({
        [hashDocument(MULTI_BRAND)]: {
          headings: ['## Shared Visual Character', '## Driftwood Imagery Rules', '## Oakwood Imagery Rules'],
          hash: hashDocument(MULTI_BRAND), model: 'test', at: new Date().toISOString(),
        },
      }),
      'utf8',
    );
    const out = await buildBrandStyleSuffixAsync('woods-team');
    expect(out).not.toContain('Walled Lake');
    expect(out).not.toContain('Oakwood interior');
    expect(out).toContain('Shared Visual Character');
    process.env.MARKETING_BRAND_SECTIONS = 'off';
  });
});
