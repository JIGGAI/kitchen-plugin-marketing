-- Migration: Initial schema for kitchen-plugin-marketing
-- Created: 2026-04-05
-- Description: Create tables for posts, media, templates, social accounts, metrics, and webhooks

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  content TEXT NOT NULL,
  platforms TEXT NOT NULL, -- JSON array of platform names
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  scheduled_at TEXT, -- ISO 8601 timestamp
  published_at TEXT, -- ISO 8601 timestamp
  tags TEXT, -- JSON array of tags
  media_ids TEXT, -- JSON array of media IDs
  template_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- Media/Assets table
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt TEXT,
  tags TEXT, -- JSON array of tags
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT, -- JSON array of variable definitions
  tags TEXT, -- JSON array of tags
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

-- Social accounts table
CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'linkedin', 'instagram', 'facebook', 'tiktok', 'youtube')),
  display_name TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
  credentials BLOB NOT NULL, -- Encrypted JSON credentials
  settings TEXT, -- JSON object for platform-specific settings
  last_sync TEXT, -- ISO 8601 timestamp
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Post metrics table
CREATE TABLE IF NOT EXISTS post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  impressions INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate TEXT, -- Stored as string to avoid float precision issues
  synced_at TEXT NOT NULL, -- When metrics were last fetched
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

-- Account metrics table (daily snapshots)
CREATE TABLE IF NOT EXISTS account_metrics (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  followers INTEGER DEFAULT 0,
  following INTEGER DEFAULT 0,
  posts INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES social_accounts(id) ON DELETE CASCADE,
  UNIQUE(account_id, date)
);

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL, -- JSON array of event types
  secret TEXT, -- Webhook signature secret
  is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  last_triggered TEXT -- ISO 8601 timestamp
);

-- Create indexes for better query performance

-- Posts indexes
CREATE INDEX IF NOT EXISTS idx_posts_team_id ON posts(team_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_template_id ON posts(template_id) WHERE template_id IS NOT NULL;

-- Media indexes
CREATE INDEX IF NOT EXISTS idx_media_team_id ON media(team_id);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);
CREATE INDEX IF NOT EXISTS idx_media_mime_type ON media(mime_type);

-- Templates indexes
CREATE INDEX IF NOT EXISTS idx_templates_team_id ON templates(team_id);
CREATE INDEX IF NOT EXISTS idx_templates_name ON templates(name);

-- Social accounts indexes
CREATE INDEX IF NOT EXISTS idx_social_accounts_team_id ON social_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_social_accounts_active ON social_accounts(is_active);

-- Post metrics indexes
CREATE INDEX IF NOT EXISTS idx_post_metrics_post_id ON post_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_metrics_platform ON post_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_post_metrics_synced_at ON post_metrics(synced_at);

-- Account metrics indexes
CREATE INDEX IF NOT EXISTS idx_account_metrics_account_id ON account_metrics(account_id);
CREATE INDEX IF NOT EXISTS idx_account_metrics_date ON account_metrics(date);

-- Webhooks indexes
CREATE INDEX IF NOT EXISTS idx_webhooks_team_id ON webhooks(team_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);