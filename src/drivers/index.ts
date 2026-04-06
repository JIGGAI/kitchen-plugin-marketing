/**
 * Driver registry — creates platform drivers with appropriate configs.
 */
export { type PostingDriver, type PostContent, type PostResult, type DriverCapabilities, type DriverStatus, type DriverConfig } from './types';
export { XDriver } from './x-driver';
export { InstagramDriver } from './instagram-driver';
export { FacebookDriver } from './facebook-driver';
export { LinkedInDriver } from './linkedin-driver';
export { TikTokDriver } from './tiktok-driver';
export { DiscordDriver } from './discord-driver';
export { TelegramDriver } from './telegram-driver';

import type { PostingDriver, DriverConfig } from './types';
import { XDriver } from './x-driver';
import { InstagramDriver } from './instagram-driver';
import { FacebookDriver } from './facebook-driver';
import { LinkedInDriver } from './linkedin-driver';
import { TikTokDriver } from './tiktok-driver';
import { DiscordDriver } from './discord-driver';
import { TelegramDriver } from './telegram-driver';

type DriverClass = new (config: DriverConfig) => PostingDriver;

const DRIVER_MAP: Record<string, DriverClass> = {
  x: XDriver,
  twitter: XDriver,
  instagram: InstagramDriver,
  facebook: FacebookDriver,
  linkedin: LinkedInDriver,
  tiktok: TikTokDriver,
  discord: DiscordDriver,
  telegram: TelegramDriver,
};

/** Get all registered platform names */
export function getPlatforms(): string[] {
  return ['x', 'instagram', 'facebook', 'linkedin', 'tiktok', 'discord', 'telegram'];
}

/** Create a driver for a specific platform */
export function createDriver(platform: string, config: DriverConfig): PostingDriver | null {
  const Cls = DRIVER_MAP[platform.toLowerCase()];
  if (!Cls) return null;
  return new Cls(config);
}

/**
 * Build driver configs by combining all available backends.
 * Checks Postiz integrations, gateway channels, and stored accounts.
 */
export interface BackendSources {
  postiz?: { apiKey: string; baseUrl: string };
  gatewayChannels?: string[]; // ['discord', 'telegram']
  storedAccounts?: Array<{
    platform: string;
    credentials: { accessToken: string; refreshToken?: string; apiKey?: string; apiSecret?: string };
  }>;
  /** Pre-fetched Postiz integrations (avoids redundant API calls per driver) */
  _postizIntegrations?: Array<{
    id: string;
    identifier: string;
    providerIdentifier?: string;
    name?: string;
    username?: string;
    profile?: string;
    picture?: string;
    disabled?: boolean;
  }>;
}

/** Create drivers for all platforms, each with the best available backend.
 *  When Postiz has multiple integrations for the same platform (e.g. two Instagram accounts),
 *  we create one driver per integration so the UI can display all of them.
 */
export function createAllDrivers(sources: BackendSources): PostingDriver[] {
  const platforms = getPlatforms();
  const drivers: PostingDriver[] = [];
  // Track which platforms already got Postiz drivers (to avoid duplicating
  // a generic driver when we already created per-integration ones)
  const postizHandled = new Set<string>();

  // Phase 1: If Postiz is configured, discover ALL integrations and create
  //          a dedicated driver for each one (pinned to that integrationId).
  if (sources.postiz && sources._postizIntegrations?.length) {
    for (const integ of sources._postizIntegrations) {
      if (integ.disabled) continue;
      const id = (integ.identifier || integ.providerIdentifier || '').toLowerCase();
      // Map Postiz identifier to our platform key
      const platform = postizIdentifierToPlatform(id);
      if (!platform) continue;

      const config: DriverConfig = {
        postiz: {
          apiKey: sources.postiz.apiKey,
          baseUrl: sources.postiz.baseUrl,
          integrationId: integ.id,  // pin to this specific integration
        },
      };
      const driver = createDriver(platform, config);
      if (driver) {
        drivers.push(driver);
        postizHandled.add(platform);
      }
    }
  }

  // Phase 2: Create drivers for non-Postiz backends (gateway, direct)
  //          and any platforms not covered by Postiz integrations above.
  for (const platform of platforms) {
    const config: DriverConfig = {};
    let needsDriver = false;

    // Postiz fallback (only if we didn't already create per-integration drivers)
    if (sources.postiz && !postizHandled.has(platform)) {
      config.postiz = {
        apiKey: sources.postiz.apiKey,
        baseUrl: sources.postiz.baseUrl,
      };
      needsDriver = true;
    }

    // Gateway — only for discord/telegram
    if (sources.gatewayChannels?.includes(platform)) {
      config.gateway = { channel: platform };
      needsDriver = true;
    }

    // Direct — from stored account tokens
    const stored = sources.storedAccounts?.find((a) => a.platform === platform);
    if (stored) {
      config.direct = stored.credentials;
      needsDriver = true;
    }

    if (needsDriver && !postizHandled.has(platform)) {
      const driver = createDriver(platform, config);
      if (driver) drivers.push(driver);
    } else if (needsDriver && postizHandled.has(platform)) {
      // Platform already has Postiz drivers but also has gateway/direct — add a non-Postiz one
      const nonPostizConfig: DriverConfig = {};
      if (sources.gatewayChannels?.includes(platform)) nonPostizConfig.gateway = { channel: platform };
      if (stored) nonPostizConfig.direct = stored.credentials;
      if (nonPostizConfig.gateway || nonPostizConfig.direct) {
        const driver = createDriver(platform, nonPostizConfig);
        if (driver) drivers.push(driver);
      }
    }
  }

  return drivers;
}

/** Map a Postiz integration identifier to our normalized platform key */
function postizIdentifierToPlatform(identifier: string): string | null {
  if (!identifier) return null;
  if (identifier === 'x' || identifier === 'twitter') return 'x';
  if (identifier.startsWith('instagram')) return 'instagram';
  if (identifier.startsWith('facebook')) return 'facebook';
  if (identifier.startsWith('linkedin')) return 'linkedin';
  if (identifier.startsWith('tiktok')) return 'tiktok';
  if (identifier.startsWith('discord')) return 'discord';
  if (identifier.startsWith('telegram')) return 'telegram';
  if (identifier.startsWith('youtube')) return 'youtube';
  if (identifier.startsWith('threads')) return 'threads';
  return null;
}
