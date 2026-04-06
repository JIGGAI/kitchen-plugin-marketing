/**
 * Base driver — each platform extends this.
 * Tries backends in order: Postiz → Gateway → Direct → none
 */
import type { PostingDriver, PostContent, PostResult, DriverCapabilities, DriverStatus, DriverConfig } from './types';
import { getPostizIntegrations, postizPublish, type PostizConfig } from './postiz-backend';

export abstract class BaseDriver implements PostingDriver {
  abstract readonly platform: string;
  abstract readonly label: string;
  abstract readonly icon: string;

  /** Postiz providerIdentifier for this platform (e.g. 'x', 'instagram') */
  abstract readonly postizProvider: string;

  protected config: DriverConfig;
  private _postizIntegrationId: string | null = null;
  private _statusCache: DriverStatus | null = null;

  constructor(config: DriverConfig) {
    this.config = config;
  }

  /** Platform-specific character limit */
  protected getMaxLength(): number | undefined { return undefined; }

  /** Platform-specific supported media types */
  protected getSupportedMedia(): string[] | undefined { return undefined; }

  getCapabilities(): DriverCapabilities {
    const hasPostiz = !!this.config.postiz;
    const hasGateway = !!this.config.gateway;
    const hasDirect = !!this.config.direct;

    return {
      canPost: hasPostiz || hasGateway || hasDirect,
      canSchedule: hasPostiz, // only Postiz supports native scheduling
      canDelete: false,
      canUploadMedia: hasPostiz || hasDirect,
      maxLength: this.getMaxLength(),
      supportedMedia: this.getSupportedMedia(),
    };
  }

  async getStatus(): Promise<DriverStatus> {
    if (this._statusCache) return this._statusCache;

    // Try Postiz first
    if (this.config.postiz) {
      try {
        const integrations = await getPostizIntegrations(this.config.postiz);
        const match = integrations.find(
          (i) => i.providerIdentifier === this.postizProvider && !i.disabled
        );
        if (match) {
          this._postizIntegrationId = this.config.postiz.integrationId || match.id;
          this._statusCache = {
            connected: true,
            backend: 'postiz',
            displayName: match.name || `${this.label} (Postiz)`,
            username: match.username,
            avatar: match.picture,
            integrationId: match.id,
          };
          return this._statusCache;
        }
      } catch { /* fall through */ }
    }

    // Try Gateway
    if (this.config.gateway) {
      this._statusCache = {
        connected: true,
        backend: 'gateway',
        displayName: `${this.label} (via OpenClaw)`,
      };
      return this._statusCache;
    }

    // Try Direct
    if (this.config.direct?.accessToken) {
      this._statusCache = {
        connected: true,
        backend: 'direct',
        displayName: `${this.label} (Direct API)`,
      };
      return this._statusCache;
    }

    this._statusCache = {
      connected: false,
      backend: 'none',
      displayName: this.label,
    };
    return this._statusCache;
  }

  async publish(content: PostContent): Promise<PostResult> {
    const status = await this.getStatus();

    switch (status.backend) {
      case 'postiz':
        return this.publishViaPostiz(content);
      case 'gateway':
        return this.publishViaGateway(content);
      case 'direct':
        return this.publishDirect(content);
      default:
        return { success: false, error: `No backend configured for ${this.label}` };
    }
  }

  /** Publish through Postiz */
  protected async publishViaPostiz(content: PostContent): Promise<PostResult> {
    const cfg = this.config.postiz;
    if (!cfg) return { success: false, error: 'Postiz not configured' };

    const integrationId = this._postizIntegrationId || cfg.integrationId;
    if (!integrationId) return { success: false, error: 'No Postiz integration found for ' + this.platform };

    const result = await postizPublish(cfg, integrationId, content.text, {
      scheduledAt: content.scheduledAt,
      mediaUrls: content.mediaUrls,
      settings: content.settings,
    });

    return {
      success: result.success,
      postId: result.postId,
      error: result.error,
      scheduledAt: content.scheduledAt,
      meta: result.meta,
    };
  }

  /** Publish through OpenClaw gateway messaging. Override for platform-specific formatting. */
  protected async publishViaGateway(_content: PostContent): Promise<PostResult> {
    return { success: false, error: `Gateway publishing not implemented for ${this.label}` };
  }

  /** Direct API publish. Override per platform. */
  protected async publishDirect(_content: PostContent): Promise<PostResult> {
    return { success: false, error: `Direct API publishing not implemented for ${this.label}` };
  }
}
