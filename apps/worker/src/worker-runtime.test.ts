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
});
