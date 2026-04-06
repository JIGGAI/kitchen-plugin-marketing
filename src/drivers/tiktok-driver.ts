import { BaseDriver } from './base-driver';

export class TikTokDriver extends BaseDriver {
  readonly platform = 'tiktok';
  readonly label = 'TikTok';
  readonly icon = '🎵';
  readonly postizProvider = 'tiktok';

  protected getMaxLength() { return 2200; }
  protected getSupportedMedia() { return ['video/mp4']; }
}
