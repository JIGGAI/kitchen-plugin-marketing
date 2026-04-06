import { BaseDriver } from './base-driver';
import type { PostContent, PostResult } from './types';

export class DiscordDriver extends BaseDriver {
  readonly platform = 'discord';
  readonly label = 'Discord';
  readonly icon = '💬';
  readonly postizProvider = 'discord';

  protected getMaxLength() { return 2000; }

  protected async publishViaGateway(content: PostContent): Promise<PostResult> {
    if (content.scheduledAt) {
      return {
        success: false,
        error: 'Scheduling via gateway not supported — save as draft and use a workflow or cron to post later',
      };
    }
    try {
      const resp = await fetch('/api/openclaw/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          channel: 'discord',
          message: content.text,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { success: false, error: data?.error || `Gateway returned ${resp.status}` };
      }
      return { success: true, postId: `gw-discord-${Date.now()}` };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gateway request failed' };
    }
  }
}
