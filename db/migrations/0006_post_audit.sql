-- Attribution for post/media create-update-delete.
--
-- On 2026-07-23, 22 marketing posts were deleted and WHO did it could not be
-- determined. On 2026-08-05, 20 unapproved posts were pushed to Postiz by an
-- automation and looked identical to human approvals in the UI. Both were
-- reconstructed by diffing hourly DB snapshots — slow, and only possible
-- because a snapshot happened to straddle the change.
--
-- `changes` holds ONLY the fields that differed: {"status": ["draft","scheduled"]}.
-- Chosen over full row snapshots because the hourly/daily DB backups already
-- cover recovery; this table answers "who and what", not "restore it".
--
-- `entity` covers media in the same table rather than a parallel one — media
-- deletes are destructive too.
CREATE TABLE IF NOT EXISTS post_audit (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_email TEXT,
  changes TEXT,
  at TEXT NOT NULL
);

-- "What happened to this post?" — the question the 2026-07-23 and 2026-08-05
-- incidents both started from.
CREATE INDEX IF NOT EXISTS idx_post_audit_entity
  ON post_audit (team_id, entity, entity_id, at);

-- "What changed in this window?" — the question the backup-diffing answered.
CREATE INDEX IF NOT EXISTS idx_post_audit_at
  ON post_audit (team_id, at);
