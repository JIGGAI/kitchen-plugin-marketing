import { sqliteTable, text, integer, blob, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Posts table
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  content: text('content').notNull(),
  platforms: text('platforms').notNull(), // JSON array
  status: text('status').notNull(), // draft, scheduled, published, failed
  scheduledAt: text('scheduled_at'), // ISO string
  publishedAt: text('published_at'), // ISO string
  tags: text('tags'), // JSON array
  mediaIds: text('media_ids'), // JSON array
  templateId: text('template_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull(),
});

// Media/Assets table
export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  alt: text('alt'),
  tags: text('tags'), // JSON array
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});

// Templates table
export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  variables: text('variables'), // JSON array of variable definitions
  tags: text('tags'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  createdBy: text('created_by').notNull(),
});

// Social accounts table
export const socialAccounts = sqliteTable('social_accounts', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  platform: text('platform').notNull(), // twitter, linkedin, instagram, etc.
  displayName: text('display_name').notNull(),
  username: text('username'),
  avatar: text('avatar'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  credentials: blob('credentials').notNull(), // Encrypted JSON
  settings: text('settings'), // JSON object
  lastSync: text('last_sync'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Post metrics table
export const postMetrics = sqliteTable('post_metrics', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  platform: text('platform').notNull(),
  impressions: integer('impressions').default(0),
  likes: integer('likes').default(0),
  shares: integer('shares').default(0),
  comments: integer('comments').default(0),
  clicks: integer('clicks').default(0),
  engagementRate: text('engagement_rate'), // Stored as string to avoid float precision issues
  platformDetails: text('platform_details'),
  syncedAt: text('synced_at').notNull(),
});

// Account metrics table (daily snapshots)
export const accountMetrics = sqliteTable('account_metrics', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  date: text('date').notNull(), // YYYY-MM-DD format
  followers: integer('followers').default(0),
  following: integer('following').default(0),
  posts: integer('posts').default(0),
  engagement: integer('engagement').default(0),
  reach: integer('reach').default(0),
  syncedAt: text('synced_at').notNull(),
});

// Plugin config table (per-team key-value, e.g. Postiz API key)
export const pluginConfig = sqliteTable('plugin_config', {
  teamId: text('team_id').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.teamId, table.key] }),
}));

// Post platform publishes table (tracks per-platform external IDs for analytics sync)
export const postPlatformPublishes = sqliteTable('post_platform_publishes', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  postId: text('post_id').notNull(),
  platform: text('platform').notNull(),
  externalId: text('external_id').notNull(),
  integrationId: text('integration_id'),
  publishedAt: text('published_at').notNull(),
  syncedAt: text('synced_at'),
  createdAt: text('created_at').notNull(),
});

export type PostPlatformPublish = typeof postPlatformPublishes.$inferSelect;
export type NewPostPlatformPublish = typeof postPlatformPublishes.$inferInsert;

// Webhooks table
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  url: text('url').notNull(),
  events: text('events').notNull(), // JSON array
  secret: text('secret'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  lastTriggered: text('last_triggered'),
});

// Generation jobs table (async image/video generation tracking)
export const generationJobs = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  teamId: text('team_id').notNull(),
  sourceMediaId: text('source_media_id').notNull(),
  type: text('type').notNull(), // 'image' or 'video'
  provider: text('provider').notNull(), // 'gemini' or 'klingai'
  prompt: text('prompt').notNull(),
  status: text('status').notNull(), // 'running', 'completed', 'failed'
  config: text('config'), // JSON object
  generatedMediaId: text('generated_media_id'), // FK to media.id on completion
  error: text('error'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
});

// Relations
export const postsRelations = relations(posts, ({ many }) => ({
  metrics: many(postMetrics),
}));

export const postMetricsRelations = relations(postMetrics, ({ one }) => ({
  post: one(posts, {
    fields: [postMetrics.postId],
    references: [posts.id],
  }),
}));

export const socialAccountsRelations = relations(socialAccounts, ({ many }) => ({
  metrics: many(accountMetrics),
}));

export const accountMetricsRelations = relations(accountMetrics, ({ one }) => ({
  account: one(socialAccounts, {
    fields: [accountMetrics.accountId],
    references: [socialAccounts.id],
  }),
}));

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
export type PostMetrics = typeof postMetrics.$inferSelect;
export type NewPostMetrics = typeof postMetrics.$inferInsert;
export type AccountMetrics = typeof accountMetrics.$inferSelect;
export type NewAccountMetrics = typeof accountMetrics.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type NewGenerationJob = typeof generationJobs.$inferInsert;