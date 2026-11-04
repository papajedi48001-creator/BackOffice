export interface HolidaySyncJob { start(): void; stop(): void }
type SyncResult = { ok: true; count: number } | { ok: false; code: string };

/**
 * ดึงวันหยุดจาก HOSxP once a day (HOLIDAY_SYNC_INTERVAL_MS). Results are logged as counts or codes only:
 * driver messages can echo the HOSxP user name, so a thrown error is logged by its class.
 */
export function createHolidaySyncJob(options: { sync(actorPersonId: null): Promise<SyncResult>; intervalMs: number; initialDelayMs: number; log(event: string, detail: Record<string, unknown>): void }): HolidaySyncJob {
  let first: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { options.log('backoffice.worker.holiday_sync', { ...(await options.sync(null)) }); }
    catch (error) { options.log('backoffice.worker.holiday_sync_failed', { code: error instanceof Error ? error.name : 'unknown' }); }
    finally { running = false; }
  };
  return {
    start() {
      if (first || timer) return;
      first = setTimeout(() => { first = undefined; void run(); timer = setInterval(() => { void run(); }, options.intervalMs); }, options.initialDelayMs);
    },
    stop() {
      if (first) clearTimeout(first);
      if (timer) clearInterval(timer);
      first = undefined; timer = undefined;
    }
  };
}
