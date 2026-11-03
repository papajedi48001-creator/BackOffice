import { describe, expect, it } from 'vitest';
import { createLineClient } from './line-client';

describe('createLineClient', () => {
  it('is null without a channel access token', () => {
    expect(createLineClient(undefined)).toBeNull();
  });

  it('posts a push with the token and retry key, and returns LINE\'s status', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = createLineClient('token-1', async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response('{}', { status: 409 }); });
    expect(await client!.push('C1', [{ type: 'text', text: 'x' }], 'retry-1')).toBe(409);
    expect(calls[0]!.url).toBe('https://api.line.me/v2/bot/message/push');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers).toEqual({ Authorization: 'Bearer token-1', 'Content-Type': 'application/json', 'X-Line-Retry-Key': 'retry-1' });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ to: 'C1', messages: [{ type: 'text', text: 'x' }] });
  });

  it('turns a network failure into a failure code without the token in it', async () => {
    const client = createLineClient('token-1', async () => { throw new Error('connect ECONNREFUSED token-1'); });
    await expect(client!.push('C1', [], 'r')).rejects.toThrow(/^LINE_UNREACHABLE$/);
  });
});
