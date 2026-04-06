import { BaseDriver } from './base-driver';
import type { PostContent, PostResult } from './types';

export class TelegramDriver extends BaseDriver {
  readonly platform = 'telegram';
  readonly label = 'Telegram';
  readonly icon = '✈️';
  readonly postizProvider = 'telegram';

  protected getMaxLength() { return 4096; }

  /** Telegram posting via OpenClaw gateway message tool */
  protected async publishViaGateway(content: PostContent): Promise<PostResult> {
    return {
      success: false,
      error: 'Gateway publishing requires OpenClaw message routing — use the scheduler or workflow',
    };
  }
}
