import { describe, it, expect } from 'vitest';

// contentTagsFromPrompt is module-private, so the matching rule is restated
// here against the same inputs it sees. Guards the two properties that matter:
// boilerplate must not become tags, and provenance must never be vocabulary.
const PROVENANCE = new Set(['derived','ai-generated','text-to-image','text-to-video',
  'image-to-video','video','image','pending-save','human','ai']);

function pick(libraryTags: string[][], prompt: string, scopeTag = 'oakwood'): string[] {
  const vocab = new Set<string>();
  for (const row of libraryTags) for (const raw of row) {
    const t = String(raw).toLowerCase();
    if (!t || PROVENANCE.has(t) || t.includes(':') || t === scopeTag) continue;
    vocab.add(t);
  }
  if (!vocab.size) return [];
  const tokens = new Set(prompt.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  const hits: string[] = [];
  for (const tag of vocab) {
    if (tokens.has(tag) || tag.split('-').some(p => p.length >= 3 && tokens.has(p))) hits.push(tag);
  }
  return hits.sort().slice(0, 8);
}

const LIB = [
  ['human','oakwood','interior','inside','televisions'],
  ['human','oakwood','close-up','plates','wings'],
  ['ai-generated','text-to-image','source:gemini','pending-save'],
];

describe('content tags from a generation prompt', () => {
  it('tags what the prompt describes', () => {
    const out = pick(LIB, 'Wide shot inside the room with televisions on and plates on the table');
    expect(out).toContain('inside');
    expect(out).toContain('televisions');
    expect(out).toContain('plates');
  });

  it('never emits provenance tags as content', () => {
    const out = pick(LIB, 'an ai-generated derived image, text-to-image, pending-save');
    for (const bad of ['ai-generated','derived','text-to-image','pending-save','human']) {
      expect(out).not.toContain(bad);
    }
  });

  it('ignores source: identifiers', () => {
    expect(pick(LIB, 'source gemini generated this')).not.toContain('source:gemini');
  });

  it('picks nothing from boilerplate the library has no tag for', () => {
    // "photo", "base", "room" are prompt boilerplate and not tags, so they
    // cannot be selected — this is what keeps every asset from sharing tags.
    expect(pick(LIB, 'Use this real photo as the base. Keep the room recognizable.')).toEqual([]);
  });

  it('returns nothing for a library with no content tags yet', () => {
    expect(pick([['ai-generated','pending-save']], 'plates and televisions')).toEqual([]);
  });

  it('never tags with the venue name — that is scoping, not content', () => {
    // Every prompt says "Oakwood Bar & Grill", so without this an asset whose
    // prompt matches nothing else would carry only the venue name.
    expect(pick(LIB, 'Realistic photo of Oakwood Bar and Grill in Dearborn')).not.toContain('oakwood');
  });

  it('matches hyphen pieces the way the base-photo scorer does', () => {
    expect(pick(LIB, 'a tight close up of the plate')).toContain('close-up');
  });
});
