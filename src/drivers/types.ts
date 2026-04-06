/**
 * Unified posting driver interface.
 * Each platform gets its own driver implementation.
 */

export interface PostContent {
  text: string;
  mediaUrls?: string[];
  scheduledAt?: string; // ISO datetime
  settings?: Record<string, unknown>; // platform-specific options
}

export interface PostResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
  scheduledAt?: string;
  meta?: Record<string, unknown>;
}

export interface DriverCapabilities {
  canPost: boolean;
  canSchedule: boolean;
  canDelete: boolean;
  canUploadMedia: boolean;
  maxLength?: number;
  supportedMedia?: string[]; // mime types
}

export interface DriverStatus {
  connected: boolean;
  backend: 'postiz' | 'gateway' | 'direct' | 'none';
  displayName: string;
  username?: string;
  avatar?: string;
  integrationId?: string; // Postiz integration ID if applicable
}

export interface PostingDriver {
  readonly platform: string;
  readonly label: string;
  readonly icon: string;

  /** Check if this driver can currently post (has credentials/connection) */
  getStatus(): Promise<DriverStatus>;

  /** What can this driver do? */
  getCapabilities(): DriverCapabilities;

  /** Publish or schedule a post */
  publish(content: PostContent): Promise<PostResult>;

  /** Delete a published post (if supported) */
  delete?(postId: string): Promise<{ success: boolean; error?: string }>;
}

/** Configuration passed to driver constructors */
export interface DriverConfig {
  postiz?: {
    apiKey: string;
    baseUrl: string;
    integrationId?: string; // specific Postiz integration for this platform
  };
  gateway?: {
    channel: string; // 'discord' | 'telegram'
    target?: string; // channel/chat ID
  };
  direct?: {
    accessToken: string;
    refreshToken?: string;
    apiKey?: string;
    apiSecret?: string;
  };
}
