import { postizFetch, type PostizConfig } from './postiz-backend';

/**
 * Postiz public-API analytics response shape.
 *
 * Endpoints:
 *   GET /analytics/post/{postId}?date=N   — per-post daily metric breakdown
 *   GET /analytics/{integrationId}?date=N — per-channel metric breakdown
 *
 * Both return an ARRAY of metric series, one entry per metric label (e.g.
 * "Likes", "Comments", "Impressions", "Followers"). Each entry contains a
 * cumulative-total time series; the last data point is the most recent
 * cumulative total for that metric.
 *
 * Verified live 2026-04-25; documented at docs.postiz.com/public-api/analytics/post.
 */
export interface PostizAnalyticsSeries {
  label: string;
  data: Array<{ total: string | number; date: string }>;
  percentageChange?: number;
}

export type PostizAnalyticsResponse = PostizAnalyticsSeries[];

export interface NormalizedMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: string | null;
  platformDetails: Record<string, unknown>;
}

/**
 * Map Postiz metric labels (varies by platform) to our canonical fields.
 * Anything that doesn't match goes into platformDetails so we don't drop data.
 */
const LABEL_TO_FIELD: Record<string, keyof Pick<NormalizedMetrics, 'impressions' | 'likes' | 'comments' | 'shares' | 'clicks'>> = {
  // impressions / reach / views all map to the same canonical "impressions"
  impressions: 'impressions',
  views: 'impressions',
  reach: 'impressions',
  // likes
  likes: 'likes',
  reactions: 'likes',
  // comments
  comments: 'comments',
  replies: 'comments',
  // shares
  shares: 'shares',
  reposts: 'shares',
  retweets: 'shares',
  // clicks
  clicks: 'clicks',
  'link clicks': 'clicks',
  'profile clicks': 'clicks',
};

function normalizeLabelKey(label: string): string {
  return String(label || '').trim().toLowerCase();
}

function latestTotal(series: PostizAnalyticsSeries): number {
  // Postiz returns cumulative totals per day; the latest data point is the
  // most recent count. Empty `data` (rare) → 0.
  const data = Array.isArray(series.data) ? series.data : [];
  if (!data.length) return 0;
  // Sort by date ascending in case the API doesn't guarantee order.
  const sorted = [...data].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = sorted[sorted.length - 1];
  return Number(last?.total ?? 0);
}

export function normalizeMetrics(
  raw: PostizAnalyticsResponse | null | undefined,
  _platform: string,
): NormalizedMetrics {
  const series = Array.isArray(raw) ? raw : [];

  const acc: NormalizedMetrics = {
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
    engagementRate: null,
    platformDetails: {},
  };

  for (const entry of series) {
    if (!entry || typeof entry !== 'object') continue;
    const labelKey = normalizeLabelKey(entry.label);
    const total = latestTotal(entry);
    const field = LABEL_TO_FIELD[labelKey];
    if (field) {
      acc[field] = total;
    } else if (entry.label) {
      // Stash unknown labels (saves, follows, etc.) so we don't lose data.
      acc.platformDetails[entry.label] = {
        total,
        percentageChange: entry.percentageChange,
        timeseries: entry.data,
      };
    }
  }

  acc.engagementRate = acc.impressions > 0
    ? ((acc.likes + acc.comments + acc.shares + acc.clicks) / acc.impressions).toFixed(4)
    : null;

  return acc;
}

/**
 * Fetch per-post analytics from Postiz. Returns null on non-2xx so callers
 * can distinguish "no metrics yet" (empty array) from "fetch failed".
 *
 * `lookbackDays` is the analytics window Postiz requires; defaults to 30 to
 * match our 30-day rolling listening window.
 */
export async function getPostAnalytics(
  config: PostizConfig,
  externalId: string,
  options: { lookbackDays?: number } = {},
): Promise<PostizAnalyticsResponse | null> {
  const days = Number.isFinite(options.lookbackDays) ? Number(options.lookbackDays) : 30;
  const path = `/analytics/post/${encodeURIComponent(externalId)}?date=${days}`;
  const res = await postizFetch(config, path);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as PostizAnalyticsResponse) : null;
}

/**
 * Fetch per-channel (integration) analytics from Postiz. Same response shape
 * as per-post; labels here include "Followers" and "Impressions".
 */
export async function getIntegrationAnalytics(
  config: PostizConfig,
  integrationId: string,
  options: { lookbackDays?: number } = {},
): Promise<PostizAnalyticsResponse | null> {
  const days = Number.isFinite(options.lookbackDays) ? Number(options.lookbackDays) : 30;
  const path = `/analytics/${encodeURIComponent(integrationId)}?date=${days}`;
  const res = await postizFetch(config, path);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? (data as PostizAnalyticsResponse) : null;
}
