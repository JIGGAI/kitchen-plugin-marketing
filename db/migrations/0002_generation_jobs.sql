-- Migration: Add generation_jobs table for async media generation
-- Created: 2026-04-17

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  source_media_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  provider TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  config TEXT,
  generated_media_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_team_id ON generation_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_source_media ON generation_jobs(source_media_id);
