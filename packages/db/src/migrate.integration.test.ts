import { randomUUID } from 'node:crypto';
import { createDatabase } from './client';
import { migrationVersions, pendingMigrations, runMigrations } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('pendingMigrations against MariaDB', () => {
  const name = `bo_pending_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  let fresh: ReturnType<typeof createDatabase>;

  beforeAll(async () => {
    await admin.execute(`CREATE DATABASE ${name} CHARACTER SET utf8mb4`);
    const url = new URL(databaseUrl!); url.pathname = `/${name}`;
    fresh = createDatabase(url.toString());
  });
  afterAll(async () => { await fresh.close(); await admin.execute(`DROP DATABASE IF EXISTS ${name}`); await admin.close(); });

  it('lists every migration on an empty database and none after running them', async () => {
    expect(await pendingMigrations(fresh)).toEqual([...migrationVersions]);
    expect(await runMigrations(fresh)).toEqual([...migrationVersions]);
    expect(await pendingMigrations(fresh)).toEqual([]);
  });
});
