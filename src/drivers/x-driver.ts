import { BaseDriver } from './base-driver';
import type { PostContent, PostResult } from './types';

export class XDriver extends BaseDriver {
  readonly platform = 'x';
  readonly label = 'X (Twitter)';
  readonly icon = '𝕏';
  readonly postizProvider = 'x';

  protected getMaxLength() { return 280; }
  protected getSupportedMedia() { return ['image/jpeg', 'image/png', 'image/gif', 'video/mp4']; }
}
