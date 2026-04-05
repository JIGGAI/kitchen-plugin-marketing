/**
 * Kitchen Plugin Marketing - Entry Point
 * 
 * Exports the plugin configuration, routes, and database utilities
 * for integration with ClawKitchen's plugin system.
 */

export { default as createRoutes } from './api/routes';
export { initializeDatabase, createDatabase, encryptCredentials, decryptCredentials } from './db';
export * as schema from './db/schema';
export type {
  PostCreateRequest,
  PostUpdateRequest,
  PostResponse,
  MediaUploadRequest,
  MediaResponse,
  TemplateCreateRequest,
  TemplateResponse,
  SocialAccountCreateRequest,
  SocialAccountResponse,
  AnalyticsOverviewResponse,
  EngagementAnalyticsResponse,
  CalendarResponse,
  WebhookCreateRequest,
  WebhookResponse,
  PaginatedResponse,
  ApiError,
} from './types';

// Plugin metadata (matches package.json kitchenPlugin section)
export const pluginMeta = {
  id: 'marketing',
  name: 'Marketing Suite',
  version: '0.2.0',
  teamTypes: ['marketing-team', 'claw-marketing-team'],
};
