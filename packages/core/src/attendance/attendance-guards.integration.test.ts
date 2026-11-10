import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { attendanceAudit } from './attendance-chain';

// The app's database account may not create triggers, so the guards are an admin-run script (infra/attendance). Skipped without both accounts.
const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_ADMIN_URL;
const describeWithDatabase = databaseUrl && adminUrl ? describe : describe.skip;
const script = new URL('../../../../infra/attendance/append-only-guards.sql', import.meta.url);

describeWithDatabase('attendance append-only guards against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const admin = adminUrl ? createDatabase(adminUrl) : undefined as never;
  const applyGuards = async () => {
    const statements = (await readFile(script, 'utf8')).split(/;\s*$/m).map((part) => part.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
    for (const statement of statements) await admin.execute(statement);
  };

  beforeAll(async () => { await runMigrations(database); });
  afterAll(async () => { await database.close(); await admin.close(); });

  it('installs twice without error and then refuses changes to the chain', async () => {
    await applyGuards();
    await applyGuards();
    const actor = randomUUID();
    await insertPerson(database, actor);
    await database.transaction((tx) => attendanceAudit(tx, actor, 'attendance.test.guard', 'attendance_test', randomUUID(), {}));
    const [{ seq }] = await database.query<{ seq: number }>('SELECT MAX(seq) AS seq FROM attendance_hash_chain') as [{ seq: number }];
    await expect(database.execute('UPDATE attendance_hash_chain SET hash = hash WHERE seq = ?', [seq])).rejects.toThrow(/attendance_append_only/);
    await expect(database.execute('DELETE FROM attendance_hash_chain WHERE seq = ?', [seq])).rejects.toThrow(/attendance_append_only/);
  });
});
