import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildBrandStyleSuffix, applyBrandContext, brandLabelFrom, buildBrandStyleSuffixAsync, listBrandVariants, composeBrandLabel } from '../brand-context';

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

describe('composeBrandLabel', () => {
  it('collapses a variant identical to the book name', () => {
    // Per-venue books ("# Oakwood Brand Book" + "## Oakwood Imagery Rules")
    // would otherwise read "Brand style (Oakwood — Oakwood):".
    expect(composeBrandLabel('Oakwood', 'Oakwood')).toBe('Oakwood');
    expect(composeBrandLabel('Oakwood', 'oakwood')).toBe('Oakwood');
  });
  it('keeps both when they differ', () => {
    expect(composeBrandLabel('Woods', 'Oakwood')).toBe('Woods — Oakwood');
  });
  it('returns the base alone when there is no variant', () => {
    expect(composeBrandLabel('Hair Mechanix', undefined)).toBe('Hair Mechanix');
    expect(composeBrandLabel('Hair Mechanix', false)).toBe('Hair Mechanix');
  });
});

// The room the brand occupies is needed on exactly one of the two generation
// paths. Text-to-image has nothing else to go on; an edit of a real shop photo
// already has the room in the pixels, and restating it fights the source.
describe('pinned sections', () => {
  const BRAND_WITH_SETTING = `# Hair Mechanix Brand Guide

## 17. Imagery rules

### Shop environment

Prose intro that is not a bullet.

- burnt-orange walls and matte-black ceilings
- black leather barber chairs

### Visual world
- dark premium base

### Avoid visually
- pastel palettes
`;

  it('includes the setting when generating from a prompt alone', () => {
    workspace(BRAND_WITH_SETTING, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromScratch');
    expect(out).toContain('- Setting: burnt-orange walls and matte-black ceilings; black leather barber chairs.');
    expect(out).toContain('dark premium base');
  });

  it('omits the setting when editing a source photo', () => {
    workspace(BRAND_WITH_SETTING, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromSource');
    expect(out).not.toContain('Setting:');
    expect(out).not.toContain('burnt-orange');
    expect(out).toContain('dark premium base');
  });

  it('defaults to including it', () => {
    workspace(BRAND_WITH_SETTING, HMX_VOICE);
    expect(buildBrandStyleSuffix()).toContain('Setting:');
  });

  it('leads with the setting so the char cap trims the tail instead', () => {
    workspace(BRAND_WITH_SETTING, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromScratch');
    expect(out.indexOf('- Setting:')).toBeLessThan(out.indexOf('- Visual world:'));
  });

  it('changes nothing for a book with no pinned sections', () => {
    workspace(HMX_BRAND, HMX_VOICE);
    expect(buildBrandStyleSuffix(undefined, undefined, 'fromScratch'))
      .toBe(buildBrandStyleSuffix(undefined, undefined, 'fromSource'));
  });

  it('does not let a model section pick reintroduce it on the from-source path', async () => {
    const dir = workspace(BRAND_WITH_SETTING, HMX_VOICE);
    const { hashDocument } = await import('../brand-sections');
    process.env.MARKETING_BRAND_SECTIONS = '';
    // The parent heading, which is what a model actually returned the first
    // time this ran — extracting it reaches the setting bullets nested below.
    writeFileSync(
      join(dir, 'shared-context', '.brand-section-cache.json'),
      JSON.stringify({
        [hashDocument(BRAND_WITH_SETTING)]: {
          headings: ['## 17. Imagery rules'],
          hash: hashDocument(BRAND_WITH_SETTING), model: 'test', at: new Date().toISOString(),
        },
      }),
      'utf8',
    );
    const out = await buildBrandStyleSuffixAsync(undefined, undefined, 'fromSource');
    expect(out).not.toContain('burnt-orange');
    expect(out).toContain('dark premium base');
    process.env.MARKETING_BRAND_SECTIONS = 'off';
  });
});

// The section is found by how the heading reads, not by a fixed path, so a
// book that calls it something else still works.
describe('setting section naming', () => {
  const renamed = (heading: string) => `# Brand

## 17. Imagery rules

${heading}
- burnt-orange walls

### Visual world
- dark premium base
`;

  for (const heading of ['### Shop environment', '### Our Space', '## The Room',
    '### Store interior', '### Shop floor', '## Venue', '### Décor', '### Setting']) {
    it(`finds "${heading}"`, () => {
      workspace(renamed(heading), HMX_VOICE);
      expect(buildBrandStyleSuffix(undefined, undefined, 'fromScratch'))
        .toContain('- Setting: burnt-orange walls.');
    });
  }

  // Headings that are not about the room. Woods' "## People and Atmosphere"
  // is casting and conduct rules — reading it as scenery would drop it from
  // every from-source prompt and quietly lose real constraints.
  for (const heading of ['## People and Atmosphere', '## Store hours', '## Place-First Hook']) {
    it(`does not read "${heading}" as the room`, () => {
      workspace(renamed(heading), HMX_VOICE);
      expect(buildBrandStyleSuffix(undefined, undefined, 'fromSource')).not.toContain('Setting:');
      expect(buildBrandStyleSuffix(undefined, undefined, 'fromScratch')).not.toContain('Setting:');
    });
  }
});

// Who is on camera applies to both paths: an edit is usually being asked to
// change exactly that, so unlike the room it is never dropped.
describe('pinned casting', () => {
  const BRAND_WITH_CASTING = `# Hair Mechanix Brand Guide

## 17. Imagery rules

### Casting
- the barber on camera is always a woman
- the client is male, any age

### Shop environment
- burnt-orange walls

### Visual world
- dark premium base
`;

  it('carries casting into a from-scratch prompt', () => {
    workspace(BRAND_WITH_CASTING, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromScratch');
    expect(out).toContain('- Casting: the barber on camera is always a woman; the client is male, any age.');
    expect(out).toContain('- Setting: burnt-orange walls.');
  });

  it('carries casting into a source-photo edit, without the room', () => {
    workspace(BRAND_WITH_CASTING, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromSource');
    expect(out).toContain('the barber on camera is always a woman');
    expect(out).not.toContain('Setting:');
    expect(out).not.toContain('burnt-orange');
  });

  it('puts casting ahead of the room so the char cap trims neither first', () => {
    workspace(BRAND_WITH_CASTING, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromScratch');
    expect(out.indexOf('- Casting:')).toBeLessThan(out.indexOf('- Setting:'));
    expect(out.indexOf('- Setting:')).toBeLessThan(out.indexOf('- Visual world:'));
  });

  it('emits a heading matching two categories only once', () => {
    workspace(`# B

## 17. Imagery rules

### People and setting
- one bullet

### Visual world
- dark premium base
`, HMX_VOICE);
    const out = buildBrandStyleSuffix(undefined, undefined, 'fromScratch');
    expect(out.match(/one bullet/g)).toHaveLength(1);
  });

  for (const heading of ['### Casting', '## Cast', '### Subjects', '## People and Atmosphere',
    '### On-camera talent']) {
    it(`finds casting under "${heading}"`, () => {
      workspace(`# B\n\n## 17. Imagery rules\n\n${heading}\n- always a woman\n`, HMX_VOICE);
      expect(buildBrandStyleSuffix(undefined, undefined, 'fromSource'))
        .toContain('- Casting: always a woman.');
    });
  }
});

// A per-venue book defines exactly one variant. Requiring the caller to name
// it meant the dashboard — which never did — silently dropped the venue's own
// Show/Avoid rules from every image request made through the UI.
describe('sole-variant books', () => {
  const SINGLE = `# Oakwood Brand Book

## Shared Visual Character
- warm wood tones

## Oakwood Imagery Rules

### Show
- The real Oakwood interior

### Avoid
- Lake, dock, boating, or waterfront imagery
`;

  it('applies the only variant when none was requested', () => {
    workspace(SINGLE, WOODS_VOICE);
    const out = buildBrandStyleSuffix('oakwood-team');
    expect(out).toContain('- Show: The real Oakwood interior.');
    expect(out).toContain('- Never show: Lake, dock, boating, or waterfront imagery.');
  });

  it('collapses the label rather than saying "Oakwood — Oakwood"', () => {
    workspace(SINGLE, WOODS_VOICE);
    expect(buildBrandStyleSuffix('oakwood-team')).toContain('Brand style (Oakwood):');
  });

  it('still honours an explicit variant', () => {
    workspace(SINGLE, WOODS_VOICE);
    expect(buildBrandStyleSuffix('oakwood-team', 'Oakwood')).toContain('The real Oakwood interior');
  });

  it('ignores an explicit variant the book does not define', () => {
    workspace(SINGLE, WOODS_VOICE);
    const out = buildBrandStyleSuffix('oakwood-team', 'Driftwood');
    expect(out).not.toContain('Show:');
  });

  // Guessing for the caller is exactly the contamination this prevents.
  it('picks nothing when a book covers several venues', () => {
    workspace(MULTI_BRAND, WOODS_VOICE);
    const out = buildBrandStyleSuffix('woods-team');
    expect(out).not.toContain('Show:');
    expect(out).not.toContain('Walled Lake');
    expect(out).not.toContain('Oakwood interior');
  });

  it('changes nothing for a book with no variants at all', () => {
    workspace(HMX_BRAND, HMX_VOICE);
    expect(buildBrandStyleSuffix('hmx-marketing-team')).toContain('Brand style (Hair Mechanix):');
  });

  it('applies the sole variant on the model-selected path too', async () => {
    const dir = workspace(SINGLE, WOODS_VOICE);
    const { hashDocument } = await import('../brand-sections');
    process.env.MARKETING_BRAND_SECTIONS = '';
    writeFileSync(
      join(dir, 'shared-context', '.brand-section-cache.json'),
      JSON.stringify({
        [hashDocument(SINGLE)]: {
          headings: ['## Shared Visual Character'],
          hash: hashDocument(SINGLE), model: 'test', at: new Date().toISOString(),
        },
      }),
      'utf8',
    );
    const out = await buildBrandStyleSuffixAsync('oakwood-team');
    expect(out).toContain('The real Oakwood interior');
    process.env.MARKETING_BRAND_SECTIONS = 'off';
  });
});
