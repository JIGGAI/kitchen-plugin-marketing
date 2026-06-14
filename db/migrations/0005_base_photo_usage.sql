-- Migration: base_photo_usage — running list of media used as image-edit base photos
-- Created: 2026-06-14

CREATE TABLE IF NOT EXISTS base_photo_usage (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  media_id    TEXT NOT NULL,
  used_at     TEXT NOT NULL,
  run_context TEXT
);

CREATE INDEX IF NOT EXISTS idx_base_photo_usage_team_media
  ON base_photo_usage (team_id, media_id);
