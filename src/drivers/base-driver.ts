/**
 * Base driver — each platform extends this.
 * Tries backends in order: Postiz → Gateway → Direct → none
 */
import type { PostingDriver, PostContent, PostResult, DriverCapabilities, DriverStatus, DriverConfig } from './types';
import { getPostizIntegrations, postizPublish, postizUpload, type PostizConfig } from './postiz-backend';
import { tryResolveLocalMedia } from './resolve-local-media';

export abstract class BaseDriver implements PostingDriver {
  abstract readonly platform: string;
  abstract readonly label: string;
  abstract readonly icon: string;

  /** Postiz providerIdentifier for this platform (e.g. 'x', 'instagram') */
  abstract readonly postizProvider: string;

  protected config: DriverConfig;
  private _postizIntegrationId: string | null = null;
  private _postizIdentifier: string | null = null;
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
        // If a specific integrationId is pinned (from createAllDrivers),
        // resolve details for just that integration.
        if (this.config.postiz.integrationId) {
          const integrations = await getPostizIntegrations(this.config.postiz);
          const pinned = integrations.find(i => i.id === this.config.postiz!.integrationId);
          if (pinned && !pinned.disabled) {
            this._postizIntegrationId = pinned.id;
            this._postizIdentifier = (pinned.identifier || pinned.providerIdentifier || this.postizProvider).toLowerCase();
            this._statusCache = {
              connected: true,
              backend: 'postiz',
              displayName: pinned.name || `${this.label} (Postiz)`,
              username: pinned.profile || pinned.username,
              avatar: pinned.picture,
              integrationId: pinned.id,
            };
            return this._statusCache;
          }
        }
        // Otherwise scan for first matching integration by platform
        const integrations = this.config.postiz.integrationId
          ? [] // already tried above
          : await getPostizIntegrations(this.config.postiz);
        const match = integrations.find(
          (i) => {
            const id = (i.identifier || i.providerIdentifier || '').toLowerCase();
            const target = this.postizProvider.toLowerCase();
            return !i.disabled && (id === target || id.startsWith(target + '-') || id.startsWith(target + '_'));
          }
        );
        if (match) {
          this._postizIntegrationId = match.id;
          this._postizIdentifier = (match.identifier || match.providerIdentifier || this.postizProvider).toLowerCase();
          this._statusCache = {
            connected: true,
            backend: 'postiz',
            displayName: match.name || `${this.label} (Postiz)`,
            username: match.profile || match.username,
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

    // Ensure integration ID + identifier are resolved (getStatus populates them)
    if (!this._postizIntegrationId) {
      await this.getStatus();
    }
    const integrationId = this._postizIntegrationId || cfg.integrationId;
    if (!integrationId) return { success: false, error: 'No Postiz integration found for ' + this.platform };

    // Upload local media to Postiz before publishing.
    // Postiz requires URLs on uploads.postiz.com — Kitchen-local paths won't work.
    let resolvedMediaUrls = content.mediaUrls;
    if (resolvedMediaUrls?.length) {
      const uploaded: string[] = [];
      for (const url of resolvedMediaUrls) {
        if (url.startsWith('https://uploads.postiz.com')) {
          uploaded.push(url);
          continue;
        }
        // Local Kitchen path or relative URL — fetch the file and upload to Postiz.
        //
        // Fast path: if this is a Kitchen plugin media URL (i.e. hosted by
        // the same plugin instance this driver is running in), read the
        // bytes directly from the plugin's media store on disk. This avoids
        // a server-to-itself HTTP hairpin that fails on deployments where
        // the Kitchen plugin only binds to a non-loopback IP.
        try {
          let buf: Buffer;
          let filename: string;
          let mime: string;

          const localMedia = tryResolveLocalMedia(url);
          if (localMedia) {
            buf = localMedia.bytes;
            filename = localMedia.filename;
            mime = localMedia.mimeType;
          } else {
            // Fall back to HTTP for remote URLs or when the local resolver
            // can't find the row/file.
            const fetchUrl = url.startsWith('/') ? `${this.config.kitchenBaseUrl || 'http://localhost:7777'}${url}` : url;
            const res = await fetch(fetchUrl);
            if (!res.ok) {
              return { success: false, error: `Failed to fetch media for Postiz upload: ${url} (${res.status})` };
            }
            buf = Buffer.from(await res.arrayBuffer());
            filename = url.split('/').pop()?.split('?')[0] || 'media.png';
            mime = res.headers.get('content-type')?.split(';')[0] || 'image/png';
          }

          const uploadResult = await postizUpload(cfg, buf, filename, mime);
          if (!uploadResult.success || !uploadResult.path) {
            return { success: false, error: `Postiz media upload failed: ${uploadResult.error || 'no path returned'}` };
          }
          uploaded.push(uploadResult.path);
        } catch (e) {
          return { success: false, error: `Media upload to Postiz failed: ${e instanceof Error ? e.message : String(e)}` };
        }
      }
      resolvedMediaUrls = uploaded;
    }

    const result = await postizPublish(cfg, integrationId, content.text, {
      scheduledAt: content.scheduledAt,
      mediaUrls: resolvedMediaUrls,
      settings: content.settings,
      platformIdentifier: this._postizIdentifier || this.postizProvider,
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
