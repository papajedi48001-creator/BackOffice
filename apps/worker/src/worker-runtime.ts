export interface WorkerRuntime {
  start(): void;
  stop(): void;
}

export function createWorkerRuntime(options: { publishBatch(): Promise<unknown>; intervalMs: number; onError?(error: unknown): void }): WorkerRuntime {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const publish = async () => {
    if (running) return;
    running = true;
    try { await options.publishBatch(); } catch (error) { options.onError?.(error); } finally { running = false; }
  };
  return {
    start() {
      if (timer) return;
      void publish();
      timer = setInterval(() => { void publish(); }, options.intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    }
  };
}
