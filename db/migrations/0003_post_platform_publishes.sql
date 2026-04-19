-- Migration: Add post_platform_publishes table and platform_details column
-- Created: 2026-04-18

CREATE TABLE IF NOT EXISTS post_platform_publishes (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  integration_id TEXT,
  published_at TEXT NOT NULL,
  synced_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_publishes_post_id ON post_platform_publishes(post_id);
CREATE INDEX IF NOT EXISTS idx_publishes_team_id ON post_platform_publishes(team_id);
CREATE INDEX IF NOT EXISTS idx_publishes_synced_at ON post_platform_publishes(synced_at);

ALTER TABLE post_metrics ADD COLUMN platform_details TEXT;
