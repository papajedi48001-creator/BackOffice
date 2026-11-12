// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatEventStream, notifyChatChanged } from './chat-stream';

const decoder = new TextDecoder();
async function readChunks(stream: ReadableStream<Uint8Array>, count: number): Promise<string[]> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (chunks.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  reader.releaseLock();
  return chunks;
}

afterEach(() => vi.useRealTimers());

describe('chatEventStream', () => {
  it('sends the state at once, then only when it changes', async () => {
    vi.useFakeTimers();
    const states = [{ unread: 0, lastMessageAt: 'a', conversationId: 'c1' }, { unread: 0, lastMessageAt: 'a', conversationId: 'c1' }, { unread: 1, lastMessageAt: 'b', conversationId: 'c1' }];
    const read = vi.fn(async () => states.shift() ?? { unread: 1, lastMessageAt: 'b', conversationId: 'c1' });
    const stream = chatEventStream(read, { checkMs: 1000, heartbeatMs: 60_000, maxMs: 600_000 });
    const first = readChunks(stream, 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toEqual(['retry: 3000\nevent: chat\ndata: {"unread":0,"lastMessageAt":"a","conversationId":"c1"}\n\n']);
    const next = readChunks(stream, 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await next).toEqual(['event: chat\ndata: {"unread":1,"lastMessageAt":"b","conversationId":"c1"}\n\n']);
    expect(read).toHaveBeenCalledTimes(3);
    await stream.cancel();
  });

  it('checks straight away when a message is sent in this server, without waiting for the next check', async () => {
    vi.useFakeTimers();
    let unread = 0;
    const read = vi.fn(async () => ({ unread, lastMessageAt: String(unread), conversationId: null }));
    const stream = chatEventStream(read, { checkMs: 60_000, heartbeatMs: 60_000, maxMs: 600_000 });
    await readChunks(stream, 1);
    unread = 2;
    const next = readChunks(stream, 1);
    notifyChatChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(await next).toEqual(['event: chat\ndata: {"unread":2,"lastMessageAt":"2","conversationId":null}\n\n']);
    await stream.cancel();
  });

  it('keeps the connection open with comments and ends after maxMs so the browser reconnects with a fresh session check', async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => ({ unread: 0, lastMessageAt: null, conversationId: null }));
    const stream = chatEventStream(read, { checkMs: 60_000, heartbeatMs: 1000, maxMs: 2500 });
    const chunks = readChunks(stream, 10);
    await vi.advanceTimersByTimeAsync(3000);
    const all = await chunks;
    expect(all.filter((chunk) => chunk === ': ping\n\n')).toHaveLength(2);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('survives a failed check and tries again next time', async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(new Error('db')).mockResolvedValue({ unread: 3, lastMessageAt: 'x', conversationId: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stream = chatEventStream(read, { checkMs: 1000, heartbeatMs: 60_000, maxMs: 600_000 });
    const first = readChunks(stream, 1);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await first)[0]).toContain('"unread":3');
    await stream.cancel();
  });
});
