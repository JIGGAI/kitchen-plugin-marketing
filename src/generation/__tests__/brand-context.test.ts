import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { buildBrandStyleSuffix, applyBrandContext, brandLabelFrom } from '../brand-context';

// Each case builds a throwaway workspace and points the resolver at it via
// MARKETING_BRAND_WORKSPACE, so nothing here depends on what's installed on
// the machine running the tests.
const made: string[] = [];

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

  it('leaves the prompt untouched when nothing usable is found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brandctx-empty2-'));
    made.push(dir);
    process.env.MARKETING_BRAND_WORKSPACE = dir;
    expect(applyBrandContext('a photo of a burger', true, 'missing-team')).toBe('a photo of a burger');
  });

  it('leaves the prompt untouched when the caller did not opt in', () => {
    workspace(WOODS_BRAND, WOODS_VOICE);
    expect(applyBrandContext('a photo of a burger', false, 'woods-team')).toBe('a photo of a burger');
  });

  it('puts the user prompt before the style suffix', () => {
    workspace(WOODS_BRAND, WOODS_VOICE);
    const out = applyBrandContext('a photo of a burger', true, 'woods-team');
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
