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
  providerIdentifier: string;
  username?: string;
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

/** Create a post via Postiz */
export async function postizPublish(
  config: PostizConfig,
  integrationId: string,
  content: string,
  options?: { scheduledAt?: string; mediaUrls?: string[]; settings?: Record<string, unknown> }
): Promise<{ success: boolean; postId?: string; error?: string; meta?: Record<string, unknown> }> {
  const payload: Record<string, unknown> = {
    content,
    integrationIds: [integrationId],
  };

  if (options?.scheduledAt) payload.date = options.scheduledAt;
  if (options?.settings) payload.settings = options.settings;
  if (options?.mediaUrls?.length) {
    payload.media = options.mediaUrls.map((url) => ({ url }));
  }

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
