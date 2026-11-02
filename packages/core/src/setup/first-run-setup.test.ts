import { describe, expect, it } from 'vitest';
import type { Database } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { buildDatabaseUrl } from './database-url';
import { FirstRunSetup, SetupError } from './first-run-setup';

const connection = { host: '192.168.1.254', port: 3306, database: 'backoffice', username: 'backoffice', password: 'p@ss/w:rd#%1' };
const admin = { firstName: 'จีระศักดิ์', lastName: 'หอกคำ', employeeCode: 'IT001', nationalId: '1101700230708', username: 'it001', password: 'long-enough-pw' };
const protector = new NationalIdProtector('a'.repeat(64), 'b'.repeat(64));

function fakeDatabase(answers: { version?: string; accounts?: number; versionError?: Error; lockHeld?: number }) {
  const state = { closed: 0, transactions: 0 };
  const database: Database = {
    execute: async () => undefined,
    query: async <T extends object>(sql: string) => {
      if (sql.includes('VERSION()')) { if (answers.versionError) throw answers.versionError; return [{ version: answers.version ?? '11.8.3-MariaDB-ubu2404' }] as T[]; }
      if (sql.includes('GET_LOCK')) return [{ held: answers.lockHeld ?? 1 }] as T[];
      if (sql.includes('information_schema.tables')) return [{ present: 1 }] as T[];
      if (sql.includes('SELECT version FROM schema_migration')) return [] as T[];
      if (sql.includes('FROM local_account')) return [{ n: answers.accounts ?? 0 }] as T[];
      return [] as T[];
    },
    transaction: async () => { state.transactions += 1; throw new Error('not in unit tests'); },
    close: async () => { state.closed += 1; }
  };
  return { database, state };
}

const codeOf = async (work: Promise<unknown>) => { try { await work; return 'none'; } catch (error) { return error instanceof SetupError ? error.code : `other:${String(error)}`; } };

describe('buildDatabaseUrl', () => {
  it('encodes special characters so the URL round-trips', () => {
    const url = new URL(buildDatabaseUrl(connection));
    expect(decodeURIComponent(url.password)).toBe('p@ss/w:rd#%1');
    expect(url.hostname).toBe('192.168.1.254');
    expect(url.port).toBe('3306');
    expect(url.pathname).toBe('/backoffice');
  });

  it('brackets an IPv6 host', () => {
    expect(new URL(buildDatabaseUrl({ ...connection, host: 'fd00::5' })).hostname).toBe('[fd00::5]');
  });
});

describe('FirstRunSetup', () => {
  it.each(['10.5.9-MariaDB', '8.0.36'])('refuses server version %s', async (version) => {
    const { database, state } = fakeDatabase({ version });
    const setup = new FirstRunSetup({ connect: () => database, protector, migrationsDir: '/nowhere' });
    expect(await codeOf(setup.testConnection(connection))).toBe('unsupported_server');
    expect(state.closed).toBe(1);
  });

  it('reports the server version, pending migrations and existing accounts', async () => {
    const { database, state } = fakeDatabase({ accounts: 2 });
    const setup = new FirstRunSetup({ connect: () => database, protector, migrationsDir: '/nowhere' });
    expect(await setup.testConnection(connection)).toMatchObject({ serverVersion: '11.8.3-MariaDB-ubu2404', hasAccounts: true });
    expect(state.closed).toBe(1);
  });

  it('refuses without the national ID keys before connecting', async () => {
    let connected = false;
    const setup = new FirstRunSetup({ connect: () => { connected = true; return fakeDatabase({}).database; }, protector: null, migrationsDir: '/nowhere' });
    expect(await codeOf(setup.complete(connection, admin))).toBe('keys_missing');
    expect(connected).toBe(false);
  });

  it('refuses a database that already has accounts and writes nothing', async () => {
    const { database, state } = fakeDatabase({ accounts: 1 });
    const setup = new FirstRunSetup({ connect: () => database, protector, migrationsDir: '/nowhere' });
    expect(await codeOf(setup.complete(connection, admin))).toBe('accounts_exist');
    expect(state.transactions).toBe(0);
    expect(state.closed).toBe(1);
  });

  it('refuses while another server holds the setup lock', async () => {
    const { database, state } = fakeDatabase({ lockHeld: 0 });
    const setup = new FirstRunSetup({ connect: () => database, protector, migrationsDir: '/nowhere' });
    expect(await codeOf(setup.complete(connection, admin))).toBe('already_configured');
    expect(state.transactions).toBe(0);
  });

  it.each([
    ['ER_ACCESS_DENIED_ERROR', 'access_denied'], ['ER_DBACCESS_DENIED_ERROR', 'access_denied'],
    ['ECONNREFUSED', 'connection_failed'], ['ETIMEDOUT', 'connection_failed'], ['ENOTFOUND', 'connection_failed'], ['ER_BAD_DB_ERROR', 'connection_failed']
  ])('turns driver error %s into %s', async (driverCode, expected) => {
    const versionError = Object.assign(new Error(`connect ${driverCode} 192.168.1.254 backoffice`), { code: driverCode });
    const { database, state } = fakeDatabase({ versionError });
    const setup = new FirstRunSetup({ connect: () => database, protector, migrationsDir: '/nowhere' });
    expect(await codeOf(setup.testConnection(connection))).toBe(expected);
    expect(state.closed).toBe(1);
  });
});
