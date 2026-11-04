import { describe, expect, it } from 'vitest';
import type { Database } from '@backoffice/db';
import { ConnectionSecretBox } from './connection-secret-box';
import { HosxpSettingsService, parseHosxpUrl } from './hosxp-settings-service';

const box = new ConnectionSecretBox('ab'.repeat(32));
function store() {
  let row: Record<string, unknown> | null = null;
  const executed: string[] = [];
  const database: Database = {
    execute: async (sql, parameters = []) => {
      executed.push(`${sql}|${JSON.stringify(parameters)}`);
      if (sql.startsWith('INSERT INTO hosxp_connection')) { const [host, port, databaseName, username, passwordCiphertext, dateColumn, nameColumn] = parameters as unknown[]; row = { host, port, databaseName, username, passwordCiphertext: passwordCiphertext ?? row?.passwordCiphertext ?? null, dateColumn, nameColumn, lastSyncAt: null, lastSyncStatus: null, lastSyncCount: null }; }
    },
    query: async <T extends object>(sql: string) => (sql.includes('FROM hosxp_connection') && row ? [row] : []) as T[],
    transaction: async (work) => work(database),
    close: async () => undefined
  };
  return { database, executed };
}

describe('HosxpSettingsService', () => {
  it('parses HOSXP_DATABASE_URL', () => {
    expect(parseHosxpUrl('mysql://ro%40x:p%3Aw@192.168.1.254:3307/hos')).toEqual({ host: '192.168.1.254', port: 3307, database: 'hos', user: 'ro@x', password: 'p:w', dateColumn: 'holiday_date', nameColumn: 'day_name' });
    expect(parseHosxpUrl('nonsense')).toBeNull();
    expect(parseHosxpUrl(undefined)).toBeNull();
  });
  it('uses the environment when nothing is saved and never returns a password in the view', async () => {
    const { database } = store();
    const service = new HosxpSettingsService(database, box, () => 'mysql://ro:pw@10.0.0.1/hos');
    expect(await service.view()).toMatchObject({ source: 'ENV', host: '10.0.0.1', port: 3306, database: 'hos', user: 'ro', passwordSet: true });
    expect(JSON.stringify(await service.view())).not.toContain('pw');
    expect(await service.resolve()).toMatchObject({ password: 'pw' });
  });
  it('stores the password sealed, keeps it when left blank, and audits only field names', async () => {
    const { database, executed } = store();
    const service = new HosxpSettingsService(database, box, () => undefined);
    expect(await service.save({ host: '192.168.1.254', port: 3306, database: 'hos', user: 'ro', password: 'topsecret', dateColumn: 'holiday_date', nameColumn: 'day_name' }, 'admin-1')).toEqual({ ok: true });
    expect(executed.join('\n')).not.toContain('topsecret');
    expect(await service.resolve()).toMatchObject({ host: '192.168.1.254', password: 'topsecret' });
    await service.save({ host: '192.168.1.254', port: 3306, database: 'hos', user: 'ro2', password: '', dateColumn: 'holiday_date', nameColumn: 'day_name' }, 'admin-1');
    expect(await service.resolve()).toMatchObject({ user: 'ro2', password: 'topsecret' });
    expect(await service.view()).toMatchObject({ source: 'SETTINGS', passwordSet: true });
  });
  it('refuses to store a password without CONNECTION_SECRET_KEY and rejects unsafe column names', async () => {
    const { database } = store();
    expect(await new HosxpSettingsService(database, null, () => undefined).save({ host: 'h', port: 3306, database: 'hos', user: 'u', password: 'x', dateColumn: 'holiday_date', nameColumn: 'day_name' }, 'a')).toEqual({ ok: false, code: 'NO_SECRET_KEY' });
    expect(await new HosxpSettingsService(database, box, () => undefined).save({ host: 'h', port: 3306, database: 'hos', user: 'u', password: 'x', dateColumn: 'a; DROP', nameColumn: 'day_name' }, 'a')).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });
});
