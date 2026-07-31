/**
 * Deciding which parts of a brand book matter for image/video generation.
 *
 * This used to be a fixed list of headings ("## 17. Imagery rules", ...).
 * That only ever worked for the one brand book it was written against: a
 * document using different headings contributed nothing, and renaming a
 * heading broke seeding silently. Woods' book has 105 sections, of which the
 * fixed list reached 3 — missing "Do Not Invent", "Logos and Brand Assets"
 * and "Alcohol Boundaries", all of which directly constrain what may be
 * depicted.
 *
 * So: ask a model to read the book once and name the sections that matter,
 * then cache that answer against the document's content hash. The call
 * happens only when the document actually changes. Every failure path falls
 * back to the caller's heuristics rather than blocking generation.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { loadConfigEnv } from './drivers';

export type SectionSelection = {
  /** Exact heading lines to include, e.g. "## Food Photography". */
  headings: string[];
  /** Content hash of the document this selection was derived from. */
  hash: string;
  model: string;
  at: string;
};

type CacheFile = Record<string, SectionSelection>;

const CACHE_BASENAME = '.brand-section-cache.json';
const MODEL = 'gemini-2.5-flash';

export function hashDocument(doc: string): string {
  return createHash('sha256').update(doc, 'utf8').digest('hex');
}

function cachePathFor(workspace: string): string {
  return join(workspace, 'shared-context', CACHE_BASENAME);
}

function readCache(workspace: string): CacheFile {
  try {
    const p = cachePathFor(workspace);
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, 'utf8')) as CacheFile;
  } catch {
    return {};
  }
}

function writeCache(workspace: string, cache: CacheFile): void {
  try {
    const p = cachePathFor(workspace);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(cache, null, 2), 'utf8');
  } catch {
    /* cache is an optimisation — never fail generation over it */
  }
}

/** Every H2/H3 heading in the document, in order. */
export function listHeadings(doc: string): string[] {
  return doc.split('\n').filter((l) => /^###?\s+\S/.test(l)).map((l) => l.trim());
}

const PROMPT = `You are configuring an automated IMAGE and VIDEO generator for a restaurant/retail brand.

Below is a brand book in markdown. Identify which sections contain guidance that should be given to an image/video generation model — things that constrain or describe what may be DEPICTED.

Include sections covering: visual style and look, photography rules, interiors/exteriors/setting, people and atmosphere, logo and asset usage, and any prohibitions on depicting things that are not real (invented food, unsupported claims, alcohol/compliance limits).

Exclude sections about: business strategy, positioning, target audience, guest occasions, pricing, copywriting/voice-only guidance, and document maintenance notes.

Respond with ONLY a JSON array of the exact heading lines, copied verbatim including the leading #'s. No prose, no code fence. Example: ["## Food Photography","## Logos and Brand Assets"]

BRAND BOOK:
`;

async function askModel(doc: string, apiKey: string): Promise<string[] | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + doc }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!res.ok) return null;
  const body: any = await res.json();
  const text: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((x): x is string => typeof x === 'string');
}

/**
 * Resolve the relevant sections for `doc`, using the cache when the document
 * is unchanged. Returns null when no selection could be made (no API key,
 * model unavailable, malformed reply) so the caller can fall back.
 */
export async function resolveSectionSelection(
  workspace: string,
  doc: string,
): Promise<SectionSelection | null> {
  if (!doc.trim()) return null;
  // Escape hatch for tests and for anyone who wants fully deterministic,
  // offline seeding: skip selection entirely and let the caller fall back
  // to its heuristics.
  if (process.env.MARKETING_BRAND_SECTIONS === 'off') return null;
  const hash = hashDocument(doc);

  const cache = readCache(workspace);
  const hit = cache[hash];
  if (hit && Array.isArray(hit.headings)) return hit;

  const env = { ...loadConfigEnv(), ...process.env } as Record<string, string>;
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  let headings: string[] | null = null;
  try {
    headings = await askModel(doc, apiKey);
  } catch {
    return null;
  }
  if (!headings || !headings.length) return null;

  // Keep only headings that genuinely exist in the document, so a
  // hallucinated or reformatted line can't silently select nothing.
  const present = new Set(listHeadings(doc));
  const verified = headings.map((h) => h.trim()).filter((h) => present.has(h));
  if (!verified.length) return null;

  const selection: SectionSelection = {
    headings: verified,
    hash,
    model: MODEL,
    at: new Date().toISOString(),
  };
  cache[hash] = selection;
  writeCache(workspace, cache);
  return selection;
}
