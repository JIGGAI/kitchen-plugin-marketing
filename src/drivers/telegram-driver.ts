import { BaseDriver } from './base-driver';
import type { PostContent, PostResult } from './types';

export class TelegramDriver extends BaseDriver {
  readonly platform = 'telegram';
  readonly label = 'Telegram';
  readonly icon = '✈️';
  readonly postizProvider = 'telegram';

  protected getMaxLength() { return 4096; }

  protected async publishViaGateway(content: PostContent): Promise<PostResult> {
    if (content.scheduledAt) {
      return {
        success: false,
        error: 'Scheduling via gateway not supported — save as draft and use a workflow or cron to post later',
      };
    }
    // Post directly through the Kitchen API which proxies to OpenClaw message tool
    try {
      const resp = await fetch('/api/openclaw/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          channel: 'telegram',
          message: content.text,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { success: false, error: data?.error || `Gateway returned ${resp.status}` };
      }
      return { success: true, postId: `gw-telegram-${Date.now()}` };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gateway request failed' };
    }
  }
}
