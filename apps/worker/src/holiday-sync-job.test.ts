import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHolidaySyncJob } from './holiday-sync-job.ts';

afterEach(() => { vi.useRealTimers(); });

describe('daily holiday sync', () => {
  it('runs shortly after start, then once a day, and stops cleanly', async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockResolvedValue({ ok: true, count: 3 });
    const log = vi.fn();
    const job = createHolidaySyncJob({ sync, intervalMs: 86_400_000, initialDelayMs: 60_000, log });
    job.start();
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(null);
    expect(log).toHaveBeenCalledWith('backoffice.worker.holiday_sync', { ok: true, count: 3 });
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(sync).toHaveBeenCalledTimes(2);
    job.stop();
    await vi.advanceTimersByTimeAsync(86_400_000 * 2);
    expect(sync).toHaveBeenCalledTimes(2);
  });
  it('logs a failure by code only and keeps going', async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockResolvedValueOnce({ ok: false, code: 'NOT_CONFIGURED' }).mockRejectedValueOnce(new Error('Access denied for user ro using password pw')).mockResolvedValue({ ok: true, count: 1 });
    const log = vi.fn();
    const job = createHolidaySyncJob({ sync, intervalMs: 1000, initialDelayMs: 0, log });
    job.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    job.stop();
    expect(log.mock.calls).toEqual([
      ['backoffice.worker.holiday_sync', { ok: false, code: 'NOT_CONFIGURED' }],
      ['backoffice.worker.holiday_sync_failed', { code: 'Error' }],
      ['backoffice.worker.holiday_sync', { ok: true, count: 1 }]
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('pw');
  });
});
