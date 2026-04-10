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

  return { success: true, postId: data?.id, meta: data };
}
