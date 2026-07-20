import { describe, it, expect } from 'vitest';
import { mediaResponseFields } from './media-response';

const base = {
  id: 'm1',
  originalName: 'smiling-barber.jpg',
  mimeType: 'image/jpeg',
  size: 1234,
  url: '/m/m1',
  alt: 'a barber',
  tags: '["human","barber"]',
  prompt: 'a smiling barber giving a fade, natural light',
  createdAt: '2026-07-18T00:00:00.000Z',
};

describe('mediaResponseFields', () => {
  it('includes the generation prompt and parses tags', () => {
    const out = mediaResponseFields(base);
    expect(out.prompt).toBe('a smiling barber giving a fade, natural light');
    expect(out.tags).toEqual(['human', 'barber']);
    expect(out.filename).toBe('smiling-barber.jpg');
  });

  it('returns null for a missing prompt and [] for missing tags', () => {
    const out = mediaResponseFields({ ...base, prompt: null, tags: null });
    expect(out.prompt).toBeNull();
    expect(out.tags).toEqual([]);
  });
});
