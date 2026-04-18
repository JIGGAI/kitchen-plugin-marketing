import { describe, it, expect } from 'vitest';
import { normalizeMetrics } from './postiz-analytics';

describe('normalizeMetrics', () => {
  it('maps core fields from a typical Instagram response', () => {
    const result = normalizeMetrics({
      postId: 'ig-123',
      impressions: 1000,
      likes: 50,
      comments: 10,
      shares: 5,
      clicks: 2,
    }, 'instagram');

    expect(result.impressions).toBe(1000);
    expect(result.likes).toBe(50);
    expect(result.comments).toBe(10);
    expect(result.shares).toBe(5);
    expect(result.clicks).toBe(2);
  });

  it('maps X response using reposts as shares', () => {
    const result = normalizeMetrics({
      postId: 'x-456',
      impressions: 500,
      likes: 20,
      comments: 3,
      reposts: 7,
    }, 'x');

    expect(result.shares).toBe(7);
  });

  it('uses views when impressions is missing', () => {
    const result = normalizeMetrics({
      postId: 'tt-789',
      views: 2000,
      likes: 100,
    }, 'tiktok');

    expect(result.impressions).toBe(2000);
  });

  it('defaults missing core fields to 0', () => {
    const result = normalizeMetrics({ postId: 'x' }, 'x');
    expect(result.impressions).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.comments).toBe(0);
    expect(result.shares).toBe(0);
    expect(result.clicks).toBe(0);
  });

  it('calculates engagement rate as string with 4 decimals', () => {
    const result = normalizeMetrics({
      postId: 'x',
      impressions: 1000,
      likes: 80,
      comments: 20,
    }, 'x');
    expect(result.engagementRate).toBe('0.1000');
  });

  it('returns null engagement rate when impressions is zero', () => {
    const result = normalizeMetrics({ postId: 'x', likes: 10 }, 'x');
    expect(result.engagementRate).toBeNull();
  });

  it('puts non-core fields into platformDetails', () => {
    const result = normalizeMetrics({
      postId: 'ig-1',
      impressions: 100,
      likes: 5,
      saves: 3,
      profile_visits: 10,
    }, 'instagram');

    expect(result.platformDetails).toEqual({ saves: 3, profile_visits: 10 });
  });

  it('excludes null/undefined values from platformDetails', () => {
    const result = normalizeMetrics({
      postId: 'x',
      impressions: 100,
      saves: null,
      clicks_on_profile: undefined,
      bookmarks: 5,
    } as any, 'x');

    expect(result.platformDetails).toEqual({ bookmarks: 5 });
  });

  it('handles string numeric values by coercing to numbers', () => {
    const result = normalizeMetrics({
      postId: 'x',
      impressions: '1000' as any,
      likes: '50' as any,
    }, 'x');

    expect(result.impressions).toBe(1000);
    expect(result.likes).toBe(50);
  });
});
