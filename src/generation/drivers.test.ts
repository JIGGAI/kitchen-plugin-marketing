import { describe, expect, it } from 'vitest';
import { normalizeGenerationError } from './drivers';

describe('normalizeGenerationError', () => {
  it('turns Kling insufficient-balance failures into an operator-facing message', () => {
    const error = new Error('Command failed: node video.mjs\nError: HTTP 429: {"code":1102,"message":"Account balance not enough","request_id":"abc-123"}');

    const normalized = normalizeGenerationError(error);

    expect(normalized.message).toBe(
      'Kling AI account balance is too low to create this video. Add Kling credits or switch to a non-Kling video provider, then try again. Kling request id: abc-123.',
    );
  });

  it('passes unrelated Error instances through unchanged', () => {
    const error = new Error('ffmpeg failed');

    expect(normalizeGenerationError(error)).toBe(error);
  });
});
