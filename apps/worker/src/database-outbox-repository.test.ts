import { describe, expect, it } from 'vitest';
import { DatabaseOutboxRepository } from './database-outbox-repository';

function fakeDatabase(rows: object[] = []) {
  const queries: string[] = [];
  const queryParameters: unknown[][] = [];
  const writes: string[] = [];
  const writeParameters: unknown[][] = [];
  return {
    queries, queryParameters, writes, writeParameters,
    database: {
      query: async <T extends object>(sql: string, parameters: unknown[] = []) => { queries.push(sql); queryParameters.push(parameters); return rows as T[]; },
      execute: async (sql: string, parameters: unknown[] = []) => { writes.push(sql); writeParameters.push(parameters); },
      transaction: async (work: (database: never) => Promise<unknown>) => work({} as never), close: async () => undefined
    }
  };
}

describe('DatabaseOutboxRepository', () => {
  it('loads only due, live notification events and marks an event processed', async () => {
    const fake = fakeDatabase([{ id: 'event-1', type: 'notification.in_app', idempotencyKey: 'key-1', payload: '{}', occurredAt: '2026-01-01 00:00:00', processedAt: null }]);
    const repository = new DatabaseOutboxRepository(fake.database as never);
    expect(await repository.pending()).toHaveLength(1);
    await repository.markProcessed('event-1');
    expect(fake.queries[0]).toContain('processed_at IS NULL');
    expect(fake.queries[0]).toContain('dead_lettered_at IS NULL');
    expect(fake.queries[0]).toContain('(next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP())');
    expect(fake.queries[0]).toContain('type IN (?, ?)');
    expect(fake.queryParameters[0]).toEqual(['notification.email', 'notification.in_app']);
    expect(fake.writes[0]).toContain('processed_at = UTC_TIMESTAMP()');
  });

  it('turns an unparseable payload into an empty payload instead of failing the batch', async () => {
    const fake = fakeDatabase([
      { id: 'broken', type: 'notification.in_app', idempotencyKey: 'key-1', payload: '{not json', occurredAt: '2026-01-01 00:00:00', processedAt: null },
      { id: 'ok', type: 'notification.in_app', idempotencyKey: 'key-2', payload: '{"subject":"x"}', occurredAt: '2026-01-01 00:00:00', processedAt: null }
    ]);
    const events = await new DatabaseOutboxRepository(fake.database as never).pending();
    expect(events.map((candidate) => candidate.payload)).toEqual([{}, { subject: 'x' }]);
  });

  it('backs off a failed event and dead-letters it after the attempt limit', async () => {
    const fake = fakeDatabase();
    await new DatabaseOutboxRepository(fake.database as never, { maxAttempts: 5 }).markFailed('event-1', 'INVALID_NOTIFICATION_EVENT');
    const sql = fake.writes[0]!;
    expect(sql).toMatch(/^UPDATE outbox_event SET/);
    expect(sql).toContain('WHERE id = ? AND processed_at IS NULL AND dead_lettered_at IS NULL');
    // MariaDB applies SET assignments left to right, so attempts must be incremented last.
    expect(sql.indexOf('attempts = attempts + 1')).toBeGreaterThan(sql.indexOf('dead_lettered_at = '));
    expect(sql.indexOf('attempts = attempts + 1')).toBeGreaterThan(sql.indexOf('next_attempt_at = '));
    expect(sql).toContain('LEAST(30 * POW(2, attempts), 3600)');
    expect(fake.writeParameters[0]).toEqual(['INVALID_NOTIFICATION_EVENT', 5, 'event-1']);
  });
});
