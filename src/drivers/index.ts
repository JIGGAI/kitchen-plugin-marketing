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
}

/** Create drivers for all platforms, each with the best available backend */
export function createAllDrivers(sources: BackendSources): PostingDriver[] {
  const platforms = getPlatforms();
  const drivers: PostingDriver[] = [];

  for (const platform of platforms) {
    const config: DriverConfig = {};

    // Postiz — available for all platforms if key exists
    if (sources.postiz) {
      config.postiz = {
        apiKey: sources.postiz.apiKey,
        baseUrl: sources.postiz.baseUrl,
      };
    }

    // Gateway — only for discord/telegram
    if (sources.gatewayChannels?.includes(platform)) {
      config.gateway = { channel: platform };
    }

    // Direct — from stored account tokens
    const stored = sources.storedAccounts?.find((a) => a.platform === platform);
    if (stored) {
      config.direct = stored.credentials;
    }

    const driver = createDriver(platform, config);
    if (driver) drivers.push(driver);
  }

  return drivers;
}
