import { BaseDriver } from './base-driver';

export class LinkedInDriver extends BaseDriver {
  readonly platform = 'linkedin';
  readonly label = 'LinkedIn';
  readonly icon = 'in';
  readonly postizProvider = 'linkedin';

  protected getMaxLength() { return 3000; }
  protected getSupportedMedia() { return ['image/jpeg', 'image/png', 'image/gif', 'video/mp4']; }
}
