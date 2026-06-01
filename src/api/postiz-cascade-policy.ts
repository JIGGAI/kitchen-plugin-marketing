// Policy for when a PATCH /posts/:id edit may cascade to the third-party
// publisher (Postiz): delete the existing external post(s) and re-publish.
//
// The hard rule: NEVER cascade a post that has already been published. Its
// content is live on the platform — re-publishing would duplicate it and a
// delete can't unpublish it. This is what bit us when a background media
// cleanup (orphan-ref healing) re-touched 3-week-old, already-published
// Mother's Day posts and they got re-recorded/re-attempted on Postiz.
//
// Posts that have NOT been published yet (draft / scheduled) DO still cascade,
// so legitimate corrections still propagate — e.g. a scheduled post missing
// an image gets fixed and re-queued on Postiz before it goes out.

export type CascadeDecision = { cascade: boolean; reason: string };

export function shouldCascadeToPostiz(opts: {
  /** The post's CURRENT status before this PATCH is applied. */
  currentStatus: string | null | undefined;
  /** Whether the post already has external publish audit rows. */
  hasExistingPublishes: boolean;
  /** Whether per-platform account tags changed in this PATCH. */
  accountTagsChanged: boolean;
  /** Whether the platforms[] set changed in this PATCH. */
  platformsChanged: boolean;
}): CascadeDecision {
  // Already live on the platform → never touch the third-party post.
  if (opts.currentStatus === 'published') {
    return { cascade: false, reason: 'already-published' };
  }
  // Nothing on Postiz to update and no new target → nothing to do.
  const worthwhile =
    opts.hasExistingPublishes || opts.accountTagsChanged || opts.platformsChanged;
  if (!worthwhile) {
    return { cascade: false, reason: 'no-publish-target' };
  }
  return { cascade: true, reason: 'ok' };
}
