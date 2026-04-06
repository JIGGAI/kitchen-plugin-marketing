import { BaseDriver } from './base-driver';
import type { PostContent, PostResult } from './types';

export class DiscordDriver extends BaseDriver {
  readonly platform = 'discord';
  readonly label = 'Discord';
  readonly icon = '💬';
  readonly postizProvider = 'discord';

  protected getMaxLength() { return 2000; }

  /** Discord posting via OpenClaw gateway message tool */
  protected async publishViaGateway(content: PostContent): Promise<PostResult> {
    // Gateway driver posts via the Kitchen proxy → OpenClaw message tool
    // The actual send happens server-side; we store intent and let the scheduler handle it
    return {
      success: false,
      error: 'Gateway publishing requires OpenClaw message routing — use the scheduler or workflow',
    };
  }
}
