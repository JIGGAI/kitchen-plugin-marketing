/**
 * Fast-path resolver for Kitchen plugin media URLs.
 *
 * The plugin's `publishViaPostiz` step needs to upload media bytes to Postiz.
 * The media URLs the plugin hands it look like:
 *
 *     /api/plugins/marketing/media/<uuid>/file?team=<teamId>
 *
 * The obvious approach — `fetch(kitchenBaseUrl + url)` — fails under a common
 * "hairpin" networking scenario: when the Kitchen plugin is only listening on
 * a non-loopback IP (e.g. a Tailscale private address), a server process
 * cannot always connect back to its own external listening socket. Undici
 * reports this as a generic `"fetch failed"` error and the whole publish
 * falls over.
 *
 * Since the plugin has direct access to its own media store (same process,
 * same filesystem), we can skip HTTP entirely and read the file from disk.
 * This is faster, has zero networking failure modes, and avoids the whole
 * hairpin class of bugs.
 *
 * Falls back to `null` if the URL isn't a Kitchen plugin media URL — the
 * caller should HTTP-fetch remote URLs normally.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { and, eq } from 'drizzle-orm';
import { initializeDatabase } from '../db';
import * as schema from '../db/schema';

/** Where `/api/plugins/marketing/media` files live on disk. */
const MEDIA_DIR = join(homedir(), '.openclaw', 'kitchen', 'plugins', 'marketing', 'media');

export type ResolvedLocalMedia = {
  bytes: Buffer;
  filename: string;
  mimeType: string;
};

/**
 * Match `/api/plugins/marketing/media/<uuid>/file?team=<teamId>` and return
 * the parsed (mediaId, teamId). Returns null for non-matching URLs so the
 * caller knows to fall back to HTTP.
 */
export function parseKitchenMediaUrl(url: string): { mediaId: string; teamId: string } | null {
  if (!url) return null;

  // Allow both absolute (`http://host:port/api/...`) and relative (`/api/...`).
  let pathAndQuery: string;
  if (url.startsWith('/')) {
    pathAndQuery = url;
  } else {
    try {
      const u = new URL(url);
      pathAndQuery = u.pathname + u.search;
    } catch {
      return null;
    }
  }

  // Must match the media file endpoint exactly.
  const match = pathAndQuery.match(/^\/api\/plugins\/marketing\/media\/([a-f0-9-]+)\/file(\?.*)?$/);
  if (!match) return null;

  const mediaId = match[1];
  const query = match[2] ?? '';

  // Pull teamId out of the query string. URL-decode because the shell script
  // URL-encodes the team id.
  let teamId = '';
  if (query.startsWith('?')) {
    const params = new URLSearchParams(query.slice(1));
    teamId = params.get('team') ?? '';
  }
  if (!teamId) return null;

  return { mediaId, teamId };
}

/**
 * Look the media row up in the plugin's own SQLite db and return its bytes
 * directly from disk. Returns null if the URL isn't a Kitchen media URL,
 * the row isn't found, or the file is missing — in any of those cases the
 * caller should fall back to an HTTP fetch.
 */
export function tryResolveLocalMedia(url: string): ResolvedLocalMedia | null {
  const parsed = parseKitchenMediaUrl(url);
  if (!parsed) return null;

  try {
    const { db } = initializeDatabase(parsed.teamId);
    const rows = db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.id, parsed.mediaId), eq(schema.media.teamId, parsed.teamId)))
      .all();
    const item = rows[0];
    if (!item) return null;

    const filePath = join(MEDIA_DIR, parsed.teamId, item.filename);
    if (!existsSync(filePath)) return null;

    const bytes = readFileSync(filePath);
    return {
      bytes,
      filename: item.originalName ?? item.filename,
      mimeType: item.mimeType ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}
