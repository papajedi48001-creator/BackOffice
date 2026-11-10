import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { attendanceAudit, verifyChain } from './attendance-chain';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('attendance hash chain against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const actor = randomUUID();
  const audit = (targetId: string) => database.transaction((tx) => attendanceAudit(tx, actor, 'attendance.test.chain', 'attendance_test', targetId, { deviceId: targetId }));
  const auditIdOf = async (targetId: string) => (await database.query<{ id: string }>('SELECT id FROM audit_event WHERE target_id = ? AND action = ?', [targetId, 'attendance.test.chain']))[0]!.id;
  const seqOf = async (auditId: string) => Number((await database.query<{ seq: number }>("SELECT seq FROM attendance_hash_chain WHERE record_type = 'audit_event' AND record_id = ?", [auditId]))[0]!.seq);

  beforeAll(async () => { await runMigrations(database); await insertPerson(database, actor); });
  afterAll(async () => { await database.close(); });

  it('links each audited action and finds a changed audit row', async () => {
    const targets = [randomUUID(), randomUUID(), randomUUID()];
    for (const target of targets) await audit(target);
    expect(await verifyChain(database)).toMatchObject({ ok: true });
    const middle = await auditIdOf(targets[1]!);
    const [original] = await database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE id = ?', [middle]);
    try {
      await database.execute("UPDATE audit_event SET metadata = '{}' WHERE id = ?", [middle]);
      expect(await verifyChain(database)).toEqual({ ok: false, brokenAtSeq: await seqOf(middle), reason: 'HASH_MISMATCH' });
    } finally {
      await database.execute('UPDATE audit_event SET metadata = ? WHERE id = ?', [original!.metadata, middle]);
    }
    expect(await verifyChain(database)).toMatchObject({ ok: true });
  });

  it('keeps the chain gap-free when ten actions commit at once', async () => {
    const targets = Array.from({ length: 10 }, () => randomUUID());
    await Promise.all(targets.map((target) => audit(target)));
    const seqs = (await Promise.all(targets.map(async (target) => seqOf(await auditIdOf(target))))).sort((a, b) => a - b);
    expect(seqs.at(-1)! - seqs[0]!).toBe(9);
    expect(await verifyChain(database)).toMatchObject({ ok: true });
  });

  it('leaves neither the audit row nor a chain row when the transaction fails', async () => {
    const target = randomUUID();
    await expect(database.transaction(async (tx) => { await attendanceAudit(tx, actor, 'attendance.test.chain', 'attendance_test', target, {}); throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await database.query('SELECT id FROM audit_event WHERE target_id = ?', [target])).toEqual([]);
    expect(await verifyChain(database)).toMatchObject({ ok: true });
  });
});
