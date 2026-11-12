import type { SupportChatLiveState } from '@backoffice/core';

/** In-process wake-up for open chat streams. A send in this server checks every open stream at once; other servers catch up at the next check. */
const changes: EventTarget = ((globalThis as { __supportChatChanges?: EventTarget }).__supportChatChanges ??= new EventTarget());

export function notifyChatChanged(): void {
  changes.dispatchEvent(new Event('change'));
}

export interface ChatStreamTiming { checkMs: number; heartbeatMs: number; maxMs: number; }
export const defaultChatStreamTiming: ChatStreamTiming = { checkMs: 2000, heartbeatMs: 15_000, maxMs: 5 * 60_000 };

const encoder = new TextEncoder();

/**
 * Server-Sent Events for แชตกับผู้ดูแลระบบ: the person's live state (button count, newest message time, conversation id; never
 * text) at once and then whenever it changes. A comment every heartbeat keeps proxies from closing the connection, and the
 * stream ends after maxMs so the browser reconnects and the session is checked again.
 */
export function chatEventStream(read: () => Promise<SupportChatLiveState>, timing: ChatStreamTiming = defaultChatStreamTiming, signal?: AbortSignal): ReadableStream<Uint8Array> {
  let last: string | null = null;
  let first = true;
  let checking = false;
  let again = false;
  let closed = false;
  let stop = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => { if (!closed) controller.enqueue(encoder.encode(text)); };
      const check = async () => {
        if (closed) return;
        if (checking) { again = true; return; }
        checking = true;
        try {
          const state = JSON.stringify(await read());
          if (state !== last) {
            last = state;
            send(`${first ? 'retry: 3000\n' : ''}event: chat\ndata: ${state}\n\n`);
            first = false;
          }
        } catch (error) {
          console.error('support_chat_stream_check_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
        } finally {
          checking = false;
          if (again) { again = false; void check(); }
        }
      };
      const onChange = () => void check();
      const checker = setInterval(() => void check(), timing.checkMs);
      const heartbeat = setInterval(() => send(': ping\n\n'), timing.heartbeatMs);
      const ending = setTimeout(() => { stop(); try { controller.close(); } catch { /* already closed */ } }, timing.maxMs);
      changes.addEventListener('change', onChange);
      stop = () => { closed = true; clearInterval(checker); clearInterval(heartbeat); clearTimeout(ending); changes.removeEventListener('change', onChange); };
      // The browser went away: stop checking even if the runtime never cancels the stream.
      signal?.addEventListener('abort', () => { stop(); try { controller.close(); } catch { /* already closed */ } }, { once: true });
      void check();
    },
    cancel() { stop(); }
  });
}
