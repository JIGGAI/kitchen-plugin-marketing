import { BaseDriver } from './base-driver';

export class InstagramDriver extends BaseDriver {
  readonly platform = 'instagram';
  readonly label = 'Instagram';
  readonly icon = '📷';
  readonly postizProvider = 'instagram';

  protected getMaxLength() { return 2200; }
  protected getSupportedMedia() { return ['image/jpeg', 'image/png', 'video/mp4']; }
}
