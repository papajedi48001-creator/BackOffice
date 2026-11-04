import { describe, expect, it } from 'vitest';
import type { Database } from '@backoffice/db';
import { HolidaySyncService } from './holiday-sync-service';

function fakeDatabase() {
  const executed: Array<{ sql: string; parameters: unknown[] }> = [];
  const database: Database = {
    execute: async (sql, parameters = []) => { executed.push({ sql, parameters: parameters as unknown[] }); },
    query: async <T extends object>() => [] as T[],
    transaction: async (work) => work(database),
    close: async () => undefined
  };
  return { database, executed };
}
const connection = { host: '192.168.1.254', port: 3306, database: 'hos', user: 'ro', password: 'pw', dateColumn: 'holiday_date', nameColumn: 'day_name' };

describe('HolidaySyncService', () => {
  it('upserts HOSxP rows without overwriting a manual holiday, and audits without secrets', async () => {
    const { database, executed } = fakeDatabase();
    const service = new HolidaySyncService(database, async () => connection, async () => [{ holiday_date: '2026-12-05', day_name: 'วันพ่อแห่งชาติ' }, { holiday_date: 'bad', day_name: 'x' }], () => new Date('2026-11-04T00:00:00Z'), () => 'id-1');
    expect(await service.sync(null)).toEqual({ ok: true, count: 1 });
    const upsert = executed.find((entry) => entry.sql.startsWith('INSERT INTO leave_holiday'))!;
    expect(upsert.sql).toContain("source = 'HOSXP'");
    expect(upsert.parameters).toEqual(['2026-12-05', 'วันพ่อแห่งชาติ', '2026-11-04 00:00:00']);
    const text = JSON.stringify(executed);
    expect(text).not.toContain('pw"');
    expect(text).not.toContain('192.168.1.254');
    expect(text).toContain('holiday.sync');
  });
  it('reports NOT_CONFIGURED and a failed read by code only', async () => {
    const { database } = fakeDatabase();
    expect(await new HolidaySyncService(database, async () => null, async () => []).sync(null)).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    const failing = new HolidaySyncService(database, async () => connection, async () => { throw Object.assign(new Error('Access denied for user ro with pw'), { code: 'ER_ACCESS_DENIED_ERROR' }); });
    expect(await failing.sync(null)).toEqual({ ok: false, code: 'CONNECTION_FAILED' });
  });
  it('reports COLUMNS_NOT_FOUND when no date or name column can be found', async () => {
    const { database } = fakeDatabase();
    expect(await new HolidaySyncService(database, async () => connection, async () => [{ a: 1, b: 2 }]).sync(null)).toEqual({ ok: false, code: 'COLUMNS_NOT_FOUND' });
  });
});
