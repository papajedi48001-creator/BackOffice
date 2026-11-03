import { describe, expect, it } from 'vitest';
import { DatabaseLineStore } from './database-line-store';

function fake(rows: object[] = []) {
  const writes: Array<{ sql: string; parameters: unknown[] }> = [];
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  return {
    writes, queries,
    database: {
      execute: async (sql: string, parameters: unknown[] = []) => { writes.push({ sql, parameters }); },
      query: async <T extends object>(sql: string, parameters: unknown[] = []) => { queries.push({ sql, parameters }); return rows as T[]; },
      transaction: async (work: (database: never) => Promise<unknown>) => work({} as never), close: async () => undefined
    }
  };
}

describe('DatabaseLineStore', () => {
  it('queues one notification.line event per in-app event, keyed by that event', async () => {
    const db = fake();
    await new DatabaseLineStore(db.database as never).enqueue('event-1', { recipientPersonId: 'p', moduleCode: 'leave', targetPath: '/leave/requests/r' });
    expect(db.writes[0]!.sql).toMatch(/^INSERT IGNORE INTO outbox_event/);
    expect(db.writes[0]!.parameters).toEqual([expect.any(String), 'notification.line', 'notification.line:event-1', JSON.stringify({ recipientPersonId: 'p', moduleCode: 'leave', targetPath: '/leave/requests/r' })]);
  });

  it('finds a route only to a group the bot is still in', async () => {
    const db = fake([{ groupId: 'C1' }]);
    expect(await new DatabaseLineStore(db.database as never).routeFor('leave')).toEqual({ groupId: 'C1' });
    expect(db.queries[0]!.sql).toContain('left_at IS NULL');
    expect(await new DatabaseLineStore(fake().database as never).routeFor('leave')).toBeNull();
  });

  it('reads the linked LINE user of a person', async () => {
    expect(await new DatabaseLineStore(fake([{ lineUserId: 'U1' }]).database as never).lineUserIdOf('p')).toBe('U1');
    expect(await new DatabaseLineStore(fake().database as never).lineUserIdOf('p')).toBeNull();
  });
});
