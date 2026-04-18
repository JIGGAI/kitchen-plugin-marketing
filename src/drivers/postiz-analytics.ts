import { postizFetch, type PostizConfig } from './postiz-backend';

export interface PostizAnalyticsResponse {
  postId?: string;
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  views?: number;
  reposts?: number;
  [key: string]: unknown;
}

export interface NormalizedMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: string | null;
  platformDetails: Record<string, unknown>;
}

const CORE_KEYS = new Set([
  'postId', 'impressions', 'likes', 'comments', 'shares', 'clicks',
  'views', 'reposts',
]);

export function normalizeMetrics(
  raw: PostizAnalyticsResponse,
  _platform: string,
): NormalizedMetrics {
  const impressions = Number(raw.impressions ?? raw.views ?? 0);
  const likes = Number(raw.likes ?? 0);
  const comments = Number(raw.comments ?? 0);
  const shares = Number(raw.shares ?? raw.reposts ?? 0);
  const clicks = Number(raw.clicks ?? 0);

  const engagementRate = impressions > 0
    ? ((likes + comments + shares + clicks) / impressions).toFixed(4)
    : null;

  const platformDetails: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (CORE_KEYS.has(k)) continue;
    if (v === null || v === undefined) continue;
    platformDetails[k] = v;
  }

  return { impressions, likes, comments, shares, clicks, engagementRate, platformDetails };
}

export async function getPostAnalytics(
  config: PostizConfig,
  externalId: string,
): Promise<PostizAnalyticsResponse | null> {
  const res = await postizFetch(config, `/posts/${encodeURIComponent(externalId)}/analytics`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data && typeof data === 'object') ? (data as PostizAnalyticsResponse) : null;
}
