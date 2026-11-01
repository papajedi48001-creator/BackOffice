import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@backoffice/db';
import { FleetCatalogService } from './fleet-catalog-service';

/** A database whose DELETE fails with the given error, after the row lock finds the car or driver. */
function failingDelete(error: object): Database {
  const database = {
    query: vi.fn(async () => [{ registration: 'กข 1234', personId: 'p-1' }]),
    execute: vi.fn(async (sql: string) => { if (sql.startsWith('DELETE')) throw error; }),
    transaction: vi.fn(async (work: (db: Database) => Promise<unknown>) => work(database as unknown as Database))
  };
  return database as unknown as Database;
}

describe('FleetCatalogService deletes', () => {
  it('answers HAS_HISTORY when the foreign-key check deadlocks with dispatch, and writes no audit', async () => {
    const database = failingDelete(Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 }));
    const service = new FleetCatalogService(database);
    expect(await service.deleteVehicle('actor', 'v-1')).toEqual({ ok: false, code: 'HAS_HISTORY' });
    expect(await service.deleteDriver('actor', 'p-1')).toEqual({ ok: false, code: 'HAS_HISTORY' });
    expect((database.execute as ReturnType<typeof vi.fn>).mock.calls.some(([sql]) => String(sql).includes('audit_event'))).toBe(false);
  });

  it('rethrows any other database error', async () => {
    const service = new FleetCatalogService(failingDelete(Object.assign(new Error('gone'), { code: 'PROTOCOL_CONNECTION_LOST' })));
    await expect(service.deleteVehicle('actor', 'v-1')).rejects.toThrow('gone');
  });
});
