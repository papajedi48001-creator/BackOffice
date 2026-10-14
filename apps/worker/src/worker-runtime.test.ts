import { describe, expect, it, vi } from 'vitest';
import { createWorkerRuntime } from './worker-runtime';

describe('createWorkerRuntime', () => {
  it('publishes a batch and stops scheduling after shutdown', async () => {
    const publishBatch = vi.fn().mockResolvedValue({ published: 1 });
    const runtime = createWorkerRuntime({ publishBatch, intervalMs: 1 });
    runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 5));
    runtime.stop();
    const callsAtStop = publishBatch.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(callsAtStop).toBeGreaterThan(0);
    expect(publishBatch).toHaveBeenCalledTimes(callsAtStop);
  });

  it('reports a failed batch and keeps polling instead of rejecting', async () => {
    const onError = vi.fn();
    const publishBatch = vi.fn().mockRejectedValueOnce(new Error('DATABASE_UNAVAILABLE')).mockResolvedValue({ published: 0 });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const runtime = createWorkerRuntime({ publishBatch, intervalMs: 1, onError });
      runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 10));
      runtime.stop();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'DATABASE_UNAVAILABLE' }));
    expect(publishBatch.mock.calls.length).toBeGreaterThan(1);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
