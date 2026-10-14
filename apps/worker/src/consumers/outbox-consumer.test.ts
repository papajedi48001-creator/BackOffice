import { describe, expect, it, vi } from 'vitest';
import type { OutboxEvent } from '@backoffice/contracts';
import { OutboxConsumer, toFailureCode } from './outbox-consumer';

function event(id: string): OutboxEvent {
  return { id, type: 'notification.in_app', idempotencyKey: `key-${id}`, payload: {}, occurredAt: new Date().toISOString(), processedAt: null };
}

describe('OutboxConsumer failure isolation', () => {
  it('records a failing event and still processes the events behind it', async () => {
    const processed: string[] = [];
    const failed: Array<[string, string]> = [];
    const consumer = new OutboxConsumer(
      {
        pending: async () => [event('bad'), event('good')],
        markProcessed: async (id) => { processed.push(id); },
        markFailed: async (id, code) => { failed.push([id, code]); }
      },
      { consume: async (candidate) => { if (candidate.id === 'bad') throw new Error('INVALID_NOTIFICATION_EVENT'); } },
      { warn: vi.fn() }
    );

    await expect(consumer.publishOutboxBatch()).resolves.toEqual({ published: 1, failed: 1 });
    expect(processed).toEqual(['good']);
    expect(failed).toEqual([['bad', 'INVALID_NOTIFICATION_EVENT']]);
  });

  it('logs only the event id, type, and sanitized code', async () => {
    const warn = vi.fn();
    const consumer = new OutboxConsumer(
      { pending: async () => [event('bad')], markProcessed: async () => undefined, markFailed: async () => undefined },
      { consume: async () => { throw new Error('connect ECONNREFUSED national id 1234567890123'); } },
      { warn }
    );

    await consumer.publishOutboxBatch();

    expect(warn).toHaveBeenCalledWith('backoffice.worker.outbox_event_failed', { eventId: 'bad', type: 'notification.in_app', code: 'UNEXPECTED_ERROR' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('1234567890123');
  });
});

describe('toFailureCode', () => {
  it.each([
    [new Error('EMAIL_NOT_CONFIGURED'), 'EMAIL_NOT_CONFIGURED'],
    [new Error('Something with spaces'), 'UNEXPECTED_ERROR'],
    ['INVALID_NOTIFICATION_EVENT', 'UNEXPECTED_ERROR'],
    [new Error(`A${'B'.repeat(80)}`), 'UNEXPECTED_ERROR']
  ])('maps %s to %s', (error, expected) => {
    expect(toFailureCode(error)).toBe(expected);
  });
});
