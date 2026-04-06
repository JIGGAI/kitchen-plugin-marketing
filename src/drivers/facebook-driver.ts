import { BaseDriver } from './base-driver';

export class FacebookDriver extends BaseDriver {
  readonly platform = 'facebook';
  readonly label = 'Facebook';
  readonly icon = '📘';
  readonly postizProvider = 'facebook';

  protected getMaxLength() { return 63206; }
  protected getSupportedMedia() { return ['image/jpeg', 'image/png', 'image/gif', 'video/mp4']; }
}
