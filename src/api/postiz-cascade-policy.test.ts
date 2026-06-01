import { describe, it, expect } from 'vitest';
import { shouldCascadeToPostiz } from './postiz-cascade-policy';

describe('shouldCascadeToPostiz', () => {
  // The regression: a background media-cleanup PATCH on an already-published
  // post must NOT re-publish or delete it on Postiz.
  it('never cascades an already-published post (even with existing publishes)', () => {
    const d = shouldCascadeToPostiz({
      currentStatus: 'published',
      hasExistingPublishes: true,
      accountTagsChanged: false,
      platformsChanged: false,
    });
    expect(d.cascade).toBe(false);
    expect(d.reason).toBe('already-published');
  });

  it('never cascades a published post even if platforms/accounts changed', () => {
    expect(
      shouldCascadeToPostiz({
        currentStatus: 'published',
        hasExistingPublishes: true,
        accountTagsChanged: true,
        platformsChanged: true,
      }).cascade,
    ).toBe(false);
  });

  // The intended-to-keep behavior: scheduled (not-yet-published) posts still
  // get corrected so a missing image, etc. is fixed before they go out.
  it('cascades a scheduled post that has existing publishes (correct it on Postiz)', () => {
    const d = shouldCascadeToPostiz({
      currentStatus: 'scheduled',
      hasExistingPublishes: true,
      accountTagsChanged: false,
      platformsChanged: false,
    });
    expect(d.cascade).toBe(true);
    expect(d.reason).toBe('ok');
  });

  it('cascades a draft whose platforms changed', () => {
    expect(
      shouldCascadeToPostiz({
        currentStatus: 'draft',
        hasExistingPublishes: false,
        accountTagsChanged: false,
        platformsChanged: true,
      }).cascade,
    ).toBe(true);
  });

  it('cascades a scheduled post whose account tags changed', () => {
    expect(
      shouldCascadeToPostiz({
        currentStatus: 'scheduled',
        hasExistingPublishes: false,
        accountTagsChanged: true,
        platformsChanged: false,
      }).cascade,
    ).toBe(true);
  });

  // Nothing to do: not-yet-published, no existing external post, no target change.
  it('does not cascade when there is no publish target', () => {
    const d = shouldCascadeToPostiz({
      currentStatus: 'scheduled',
      hasExistingPublishes: false,
      accountTagsChanged: false,
      platformsChanged: false,
    });
    expect(d.cascade).toBe(false);
    expect(d.reason).toBe('no-publish-target');
  });

  it('treats null/undefined status as not-published (may cascade if worthwhile)', () => {
    expect(
      shouldCascadeToPostiz({
        currentStatus: null,
        hasExistingPublishes: true,
        accountTagsChanged: false,
        platformsChanged: false,
      }).cascade,
    ).toBe(true);
  });
});
