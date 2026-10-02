import { describe, expect, it } from 'vitest';
import { DatabaseOutboxRepository } from './database-outbox-repository';

describe('DatabaseOutboxRepository', () => {
  it('loads only pending notification events and marks an event processed', async () => {
    const queries: string[] = [];
    const queryParameters: unknown[][] = [];
    const writes: string[] = [];
    const repository = new DatabaseOutboxRepository({
      query: async <T extends object>(sql: string, parameters: unknown[] = []) => {
        queries.push(sql);
        queryParameters.push(parameters);
        return [{ id: 'event-1', type: 'notification.in_app', idempotencyKey: 'key-1', payload: '{}', occurredAt: '2026-01-01 00:00:00', processedAt: null }] as T[];
      },
      execute: async (sql) => { writes.push(sql); },
      transaction: async (work) => work({} as never), close: async () => undefined
    });
    expect(await repository.pending()).toHaveLength(1);
    await repository.markProcessed('event-1');
    expect(queries[0]).toContain('processed_at IS NULL');
    expect(queries[0]).toContain('type IN (?, ?)');
    expect(queryParameters[0]).toEqual(['notification.email', 'notification.in_app']);
    expect(writes[0]).toContain('processed_at = UTC_TIMESTAMP()');
  });
});
