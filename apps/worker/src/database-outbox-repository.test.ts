import { describe, expect, it } from 'vitest';
import { DatabaseOutboxRepository } from './database-outbox-repository';

describe('DatabaseOutboxRepository', () => {
  it('loads only pending events and marks an event processed', async () => {
    const queries: string[] = [];
    const writes: string[] = [];
    const repository = new DatabaseOutboxRepository({
      query: async <T extends object>(sql: string) => { queries.push(sql); return [{ id: 'event-1', type: 'workflow.request.submitted', idempotencyKey: 'key-1', payload: '{}', occurredAt: '2026-01-01 00:00:00', processedAt: null }] as T[]; },
      execute: async (sql) => { writes.push(sql); },
      transaction: async (work) => work({} as never), close: async () => undefined
    });
    expect(await repository.pending()).toHaveLength(1);
    await repository.markProcessed('event-1');
    expect(queries[0]).toContain('processed_at IS NULL');
    expect(writes[0]).toContain('processed_at = UTC_TIMESTAMP()');
  });
});
