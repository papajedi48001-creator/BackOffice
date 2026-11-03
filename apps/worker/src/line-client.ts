import type { WorkerLineClient } from './consumers/line-alert-consumer.ts';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

/** Messaging API push. Null without a channel access token, which switches LINE off. The token never appears in an error. */
export function createLineClient(channelAccessToken: string | undefined, fetcher: typeof fetch = fetch): WorkerLineClient | null {
  if (!channelAccessToken) return null;
  return {
    async push(to, messages, retryKey) {
      try {
        const response = await fetcher(PUSH_URL, { method: 'POST', headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey }, body: JSON.stringify({ to, messages }), signal: AbortSignal.timeout(10_000) });
        return response.status;
      } catch {
        throw new Error('LINE_UNREACHABLE');
      }
    }
  };
}
