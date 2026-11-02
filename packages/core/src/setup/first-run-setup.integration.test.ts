import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, migrationVersions, runMigrations, type Database } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { LocalAuthService } from '../identity/auth-service';
import { DatabaseLocalAccountRepository } from '../identity/database-identity-repository';
import { nationalId } from '../hr/national-id-fixture';
import { FirstRunSetup, SetupError } from './first-run-setup';

// Creates and drops whole databases and users, so it needs a MariaDB account allowed to (root in CI); skipped without one.
const databaseUrl = process.env.DATABASE_ADMIN_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const migrationsDir = resolve(import.meta.dirname, '../../../db/migrations');
const password = 'p@ss/w:rd#%1';

describeWithDatabase('FirstRunSetup against MariaDB', () => {
  const root = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const host = databaseUrl ? new URL(databaseUrl).hostname : '';
  const port = databaseUrl ? Number(new URL(databaseUrl).port || 3306) : 3306;
  const protector = new NationalIdProtector('a'.repeat(64), 'b'.repeat(64));
  const made: { databases: string[]; users: string[] } = { databases: [], users: [] };
  const opened: Database[] = [];
  const connect = (url: string) => { const database = createDatabase(url.includes('?') ? url : `${url}?connectionLimit=1`); opened.push(database); return database; };
  const setup = new FirstRunSetup({ connect, protector, migrationsDir });
  const short = () => randomUUID().replace(/-/g, '').slice(0, 10);
  const admin = () => ({ firstName: 'จีระศักดิ์', lastName: 'หอกคำ', employeeCode: `IT${short()}`, nationalId: nationalId(`1${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`), username: `it.${short()}`, password: 'long-enough-pw' });

  async function freshDatabase(privileges: 'ddl' | 'dml', migrated = false) {
    const name = `bo_setup_${short()}`; const user = `bo_${short()}`;
    made.databases.push(name); made.users.push(user);
    await root.execute(`CREATE DATABASE ${name} CHARACTER SET utf8mb4`);
    if (migrated) { const url = new URL(databaseUrl!); url.pathname = `/${name}`; const db = createDatabase(url.toString()); await runMigrations(db); await db.close(); }
    await root.execute(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'`);
    const grants = privileges === 'ddl' ? 'SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES' : 'SELECT, INSERT, UPDATE, DELETE';
    await root.execute(`GRANT ${grants} ON ${name}.* TO '${user}'@'%'`);
    return { connection: { host, port, database: name, username: user, password }, name };
  }
  const inDatabase = (name: string) => { const url = new URL(databaseUrl!); url.pathname = `/${name}`; return connect(url.toString()); };
  const count = async (db: Database, sql: string) => Number((await db.query<{ n: number }>(sql))[0]!.n);
  const codeOf = async (work: Promise<unknown>) => { try { await work; return 'none'; } catch (error) { return error instanceof SetupError ? error.code : `other:${String(error)}`; } };

  beforeAll(async () => undefined);
  afterAll(async () => {
    for (const database of opened) await database.close().catch(() => undefined);
    for (const name of made.databases) await root.execute(`DROP DATABASE IF EXISTS ${name}`);
    for (const user of made.users) await root.execute(`DROP USER IF EXISTS '${user}'@'%'`);
    await root.close();
  });

  it('migrates an empty database and creates the first ผู้ดูแลระบบ who can sign in', async () => {
    const { connection, name } = await freshDatabase('ddl');
    const values = admin();
    const result = await setup.complete(connection, values);
    expect(result.migrationsApplied).toBe(migrationVersions.length);
    expect(decodeURIComponent(new URL(result.databaseUrl).password)).toBe(password);
    const db = inDatabase(name);
    const [person] = await db.query<{ displayName: string; employeeCode: string; masked: string; status: string }>('SELECT display_name AS displayName, employee_code AS employeeCode, national_id_masked AS masked, employment_status AS status FROM person WHERE id = ?', [result.personId]);
    expect(person).toMatchObject({ displayName: 'จีระศักดิ์ หอกคำ', employeeCode: values.employeeCode, status: 'ACTIVE' });
    expect(person!.masked).toMatch(/^X-XXXX-XXXXX-/);
    const roles = await db.query<{ name: string; organizationId: string | null }>('SELECT role.name AS name, role_assignment.organization_id AS organizationId FROM role_assignment JOIN role ON role.id = role_assignment.role_id WHERE person_id = ?', [result.personId]);
    expect(roles).toEqual([{ name: 'admin', organizationId: null }]);
    const audits = await db.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'system.setup.completed' AND actor_person_id = ?", [result.personId]);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).not.toContain(values.nationalId);
    expect(audits[0]!.metadata).not.toContain(values.password);
    expect(JSON.parse(audits[0]!.metadata)).toMatchObject({ migrationsApplied: migrationVersions.length });
    const signedIn = await new LocalAuthService(new DatabaseLocalAccountRepository(db)).authenticateLocal({ username: values.username, password: values.password });
    expect(signedIn.personId).toBe(result.personId);
  });

  it('uses a database the SQL script already migrated with a user that may only read and write', async () => {
    const { connection } = await freshDatabase('dml', true);
    expect((await setup.testConnection(connection)).pendingMigrations).toBe(0);
    expect((await setup.complete(connection, admin())).migrationsApplied).toBe(0);
  });

  it('says the user may not create tables when an empty database needs migrating', async () => {
    const { connection } = await freshDatabase('dml');
    expect(await codeOf(setup.complete(connection, admin()))).toBe('migration_privilege_missing');
  });

  it('refuses a database that already has accounts without adding a person', async () => {
    const { connection, name } = await freshDatabase('ddl');
    await setup.complete(connection, admin());
    const db = inDatabase(name);
    const before = await count(db, 'SELECT COUNT(*) AS n FROM person');
    expect(await codeOf(setup.complete(connection, admin()))).toBe('accounts_exist');
    expect(await count(db, 'SELECT COUNT(*) AS n FROM person')).toBe(before);
  });

  it('creates one ผู้ดูแลระบบ when two servers complete setup at the same time', async () => {
    const { connection, name } = await freshDatabase('ddl');
    const other = new FirstRunSetup({ connect, protector, migrationsDir });
    const codes = await Promise.all([codeOf(setup.complete(connection, admin())), codeOf(other.complete(connection, admin()))]);
    expect(codes.sort()).toEqual(['accounts_exist', 'none']);
    expect(await count(inDatabase(name), 'SELECT COUNT(*) AS n FROM local_account')).toBe(1);
  });

  it('rolls everything back when the employee code is taken', async () => {
    const { connection, name } = await freshDatabase('ddl', true);
    const db = inDatabase(name);
    const values = admin();
    await db.execute('INSERT INTO person (id, employee_code, national_id_ciphertext, national_id_lookup, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [randomUUID(), values.employeeCode, 'x', randomUUID()]);
    expect(await codeOf(setup.complete(connection, values))).not.toBe('none');
    expect(await count(db, 'SELECT COUNT(*) AS n FROM local_account')).toBe(0);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM role_assignment')).toBe(0);
    expect(await count(db, 'SELECT COUNT(*) AS n FROM person')).toBe(1);
  });
});
