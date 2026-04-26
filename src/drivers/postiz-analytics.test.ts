import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPostAnalytics, getIntegrationAnalytics, normalizeMetrics } from './postiz-analytics';

// Helper: build a Postiz-style time-series entry. The API returns cumulative
// totals per day, so the latest data point is the current count.
const series = (label: string, dailyTotals: Array<[string, number]>, percentageChange = 0) => ({
  label,
  data: dailyTotals.map(([date, total]) => ({ total, date })),
  percentageChange,
});

describe('normalizeMetrics (Postiz time-series shape)', () => {
  it('maps a typical Instagram post analytics response', () => {
    const raw = [
      series('Likes',       [['2026-04-25', 150], ['2026-04-26', 175]]),
      series('Comments',    [['2026-04-25',  20], ['2026-04-26',  25]]),
      series('Shares',      [['2026-04-25',   5], ['2026-04-26',   8]]),
      series('Impressions', [['2026-04-25',1000], ['2026-04-26',1200]]),
    ];
    const result = normalizeMetrics(raw, 'instagram');
    // Latest day's total wins.
    expect(result.impressions).toBe(1200);
    expect(result.likes).toBe(175);
    expect(result.comments).toBe(25);
    expect(result.shares).toBe(8);
  });

  it('maps X response using "Reposts" as shares', () => {
    const raw = [
      series('Likes',       [['2026-04-26',  20]]),
      series('Comments',    [['2026-04-26',   3]]),
      series('Reposts',     [['2026-04-26',   7]]),
      series('Impressions', [['2026-04-26', 500]]),
    ];
    const result = normalizeMetrics(raw, 'x');
    expect(result.shares).toBe(7);
  });

  it('treats "Views" and "Reach" as impressions', () => {
    const viewsOnly = normalizeMetrics([series('Views', [['2026-04-26', 2000]])], 'tiktok');
    expect(viewsOnly.impressions).toBe(2000);

    const reachOnly = normalizeMetrics([series('Reach', [['2026-04-26', 800]])], 'instagram');
    expect(reachOnly.impressions).toBe(800);
  });

  it('returns all zeros when Postiz returns an empty array (post not yet sent)', () => {
    const result = normalizeMetrics([], 'instagram');
    expect(result.impressions).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.comments).toBe(0);
    expect(result.shares).toBe(0);
    expect(result.clicks).toBe(0);
    expect(result.engagementRate).toBeNull();
  });

  it('handles null/undefined raw input gracefully', () => {
    expect(normalizeMetrics(null, 'instagram').impressions).toBe(0);
    expect(normalizeMetrics(undefined, 'instagram').impressions).toBe(0);
  });

  it('calculates engagement rate as string with 4 decimals', () => {
    const raw = [
      series('Likes',       [['2026-04-26',  80]]),
      series('Comments',    [['2026-04-26',  20]]),
      series('Impressions', [['2026-04-26',1000]]),
    ];
    const result = normalizeMetrics(raw, 'x');
    expect(result.engagementRate).toBe('0.1000');
  });

  it('returns null engagement rate when impressions is zero', () => {
    const raw = [series('Likes', [['2026-04-26', 10]])];
    const result = normalizeMetrics(raw, 'x');
    expect(result.engagementRate).toBeNull();
  });

  it('stashes unknown labels (saves, profile_visits) into platformDetails with timeseries', () => {
    const raw = [
      series('Likes',          [['2026-04-26',   5]]),
      series('Saves',          [['2026-04-26',   3], ['2026-04-27', 4]], 33.3),
      series('Profile visits', [['2026-04-26',  10]]),
    ];
    const result = normalizeMetrics(raw, 'instagram');
    expect(result.likes).toBe(5);
    expect(result.platformDetails).toMatchObject({
      Saves: { total: 4, percentageChange: 33.3 },
      'Profile visits': { total: 10 },
    });
    // timeseries preserved for chart rendering
    const saves = result.platformDetails.Saves as { timeseries: unknown[] };
    expect(saves.timeseries).toHaveLength(2);
  });

  it('handles unsorted daily data points by picking the latest by date', () => {
    const raw = [
      // Postiz docs don't guarantee order; verify we don't depend on it.
      series('Likes', [['2026-04-27', 200], ['2026-04-25', 100], ['2026-04-26', 150]]),
    ];
    expect(normalizeMetrics(raw, 'x').likes).toBe(200);
  });

  it('coerces string numeric totals to numbers', () => {
    const raw = [series('Likes', [['2026-04-26', '50' as unknown as number]])];
    expect(normalizeMetrics(raw, 'x').likes).toBe(50);
  });

  it('is case-insensitive on labels', () => {
    const raw = [
      series('LIKES',       [['2026-04-26', 5]]),
      series('impressions', [['2026-04-26', 100]]),
    ];
    const result = normalizeMetrics(raw, 'x');
    expect(result.likes).toBe(5);
    expect(result.impressions).toBe(100);
  });
});

describe('getPostAnalytics (path + auth wiring)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hits /analytics/post/{id}?date=30 by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([series('Likes', [['2026-04-26', 5]])]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getPostAnalytics(
      { apiKey: 'k', baseUrl: 'https://api.postiz.com/public/v1' },
      'cmodrpqdb00zlq70yklw6px7p',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://api.postiz.com/public/v1/analytics/post/cmodrpqdb00zlq70yklw6px7p?date=30');
  });

  it('honors lookbackDays option', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getPostAnalytics(
      { apiKey: 'k', baseUrl: 'https://api.postiz.com/public/v1' },
      'abc',
      { lookbackDays: 7 },
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('?date=7');
  });

  it('returns null on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    const r = await getPostAnalytics(
      { apiKey: 'k', baseUrl: 'https://api.postiz.com/public/v1' },
      'abc',
    );
    expect(r).toBeNull();
  });

  it('returns null on non-array body (defends against API shape drift)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ unexpected: 'object' }),
    }));
    const r = await getPostAnalytics(
      { apiKey: 'k', baseUrl: 'https://api.postiz.com/public/v1' },
      'abc',
    );
    expect(r).toBeNull();
  });
});

describe('getIntegrationAnalytics (path + auth wiring)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hits /analytics/{integrationId}?date=30 by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([series('Followers', [['2026-04-26', 1250]])]),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getIntegrationAnalytics(
      { apiKey: 'k', baseUrl: 'https://api.postiz.com/public/v1' },
      'cmnnfymsy08puso0yje4ux62o',
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://api.postiz.com/public/v1/analytics/cmnnfymsy08puso0yje4ux62o?date=30');
  });
});
