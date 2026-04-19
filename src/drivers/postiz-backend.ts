/**
 * Shared Postiz API helpers used by platform drivers.
 */

export interface PostizConfig {
  apiKey: string;
  baseUrl: string;
}

export async function postizFetch(config: PostizConfig, path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': config.apiKey,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
}

export interface PostizIntegration {
  id: string;
  name: string;
  /** Postiz returns this as 'identifier' (e.g. 'facebook', 'instagram-standalone', 'x') */
  identifier: string;
  /** Some versions may use providerIdentifier */
  providerIdentifier?: string;
  username?: string;
  profile?: string;
  picture?: string;
  disabled?: boolean;
}

/** Fetch all connected Postiz integrations */
export async function getPostizIntegrations(config: PostizConfig): Promise<PostizIntegration[]> {
  const res = await postizFetch(config, '/integrations');
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data.integrations || []);
}

/**
 * Default settings per platform. Postiz requires a `settings` object with `__type`
 * for every integration. Some platforms have additional required fields.
 */
const DEFAULT_PLATFORM_SETTINGS: Record<string, Record<string, unknown>> = {
  'x': { __type: 'x', who_can_reply_post: 'everyone' },
  'instagram': { __type: 'instagram', post_type: 'post', is_trial_reel: false, collaborators: [] },
  'instagram-standalone': { __type: 'instagram-standalone', post_type: 'post', is_trial_reel: false, collaborators: [] },
  'facebook': { __type: 'facebook' },
  'linkedin': { __type: 'linkedin' },
  'linkedin-page': { __type: 'linkedin-page' },
  'threads': { __type: 'threads' },
  'bluesky': { __type: 'bluesky' },
  'mastodon': { __type: 'mastodon' },
  'telegram': { __type: 'telegram' },
  'discord': { __type: 'discord' },
  'tiktok': { __type: 'tiktok', privacy_level: 'PUBLIC_TO_EVERYONE', duet: true, stitch: true, comment: true, autoAddMusic: 'no', brand_content_toggle: false, brand_organic_toggle: false, content_posting_method: 'DIRECT_POST' },
  'youtube': { __type: 'youtube', title: 'Post', type: 'public' },
  'reddit': { __type: 'reddit' },
  'pinterest': { __type: 'pinterest' },
};

/** Resolve the __type for a Postiz integration identifier */
export function resolvePostizType(identifier: string): string {
  // Postiz identifiers like 'instagram-standalone', 'facebook', 'x', etc.
  // map directly to __type values
  return identifier.toLowerCase();
}

/** Upload a file to Postiz and return the public URL (uploads.postiz.com). */
export async function postizUpload(
  config: PostizConfig,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ success: boolean; path?: string; id?: string; error?: string }> {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

  const res = await fetch(`${config.baseUrl}/upload`, {
    method: 'POST',
    headers: { 'Authorization': config.apiKey },
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { success: false, error: data?.message || `Postiz upload error ${res.status}` };
  }
  return { success: true, path: data?.path, id: data?.id };
}

/** Create a post via Postiz (v1 posts API) */
export async function postizPublish(
  config: PostizConfig,
  integrationId: string,
  content: string,
  options?: {
    scheduledAt?: string;
    mediaUrls?: string[];
    settings?: Record<string, unknown>;
    platformIdentifier?: string; // e.g. 'instagram-standalone', 'x', 'facebook'
  }
): Promise<{ success: boolean; postId?: string; error?: string; meta?: Record<string, unknown> }> {
  // Build per-platform settings with __type
  const platformId = (options?.platformIdentifier || '').toLowerCase();
  const defaultSettings = DEFAULT_PLATFORM_SETTINGS[platformId] || { __type: platformId };
  const settings = { ...defaultSettings, ...(options?.settings || {}) };

  // Build image array from media URLs
  const image = (options?.mediaUrls || []).map((url, i) => ({ id: `img${i}`, path: url }));

  // Postiz v1 payload:
  //   date is ALWAYS required (even for "now" posts)
  //   value is an ARRAY of content objects
  //   settings is a SIBLING of value (not nested inside it)
  const postDate = options?.scheduledAt || new Date().toISOString();
  const payload: Record<string, unknown> = {
    type: options?.scheduledAt ? 'schedule' : 'now',
    date: postDate,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: integrationId },
        value: [
          {
            content,
            image,
            settings,
          },
        ],
        settings,
      },
    ],
  };

  const res = await postizFetch(config, '/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    return { success: false, error: data?.message || `Postiz error ${res.status}`, meta: data };
  }

  // Postiz v1 returns [{ postId, integration }, ...]; one entry per integration.
  // We always publish with a single pinned integration, so data[0].postId is the
  // right answer. Fall back to the legacy `id` shape defensively.
  const extractedPostId = Array.isArray(data)
    ? data[0]?.postId || data[0]?.id
    : data?.postId || data?.id;
  return { success: true, postId: extractedPostId, meta: data };
}

/**
 * List scheduled/published Postiz posts in a date range.
 * Postiz returns an array with an `id` field per post (Postiz post id).
 * Caller uses this to reconcile local audit against Postiz's current state.
 */
export async function postizListPosts(
  config: PostizConfig,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<Array<{ id: string; integration?: string; content?: string; publishDate?: string; state?: string; raw: unknown }>> {
  const params = new URLSearchParams();
  if (opts.startDate) params.set('startDate', opts.startDate);
  if (opts.endDate) params.set('endDate', opts.endDate);
  const qs = params.toString();
  const res = await postizFetch(config, `/posts${qs ? `?${qs}` : ''}`, { method: 'GET' });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const items = Array.isArray(data) ? data : (Array.isArray((data as any)?.posts) ? (data as any).posts : []);
  return items
    .filter((p: any) => p && (p.id || p.postId))
    .map((p: any) => ({
      id: String(p.id || p.postId),
      integration: p.integration ? String(p.integration) : undefined,
      content: typeof p.content === 'string' ? p.content : undefined,
      publishDate: p.publishDate ? String(p.publishDate) : undefined,
      state: p.state ? String(p.state) : undefined,
      raw: p,
    }));
}

/**
 * Delete a Postiz post by its external ID. Postiz cascades by group, so a
 * single delete cleans up sibling posts in the same scheduling group too.
 * Returns success even on 404 so callers can treat "already gone" as resolved.
 */
export async function postizDeletePost(
  config: PostizConfig,
  postizPostId: string,
): Promise<{ success: boolean; error?: string; status?: number }> {
  if (!postizPostId) return { success: false, error: 'Missing postizPostId' };
  try {
    const res = await postizFetch(config, `/posts/${encodeURIComponent(postizPostId)}`, {
      method: 'DELETE',
    });
    if (res.ok || res.status === 404) return { success: true, status: res.status };
    const data = await res.json().catch(() => null);
    return { success: false, status: res.status, error: data?.message || `Postiz delete ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}
