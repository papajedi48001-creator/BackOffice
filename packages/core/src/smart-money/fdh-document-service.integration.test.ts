import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, NhsoCell } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import legacy from './fixtures/fdh-legacy.json';
import { FdhDocumentService } from './fdh-document-service';
import { MoneyMemberService } from './money-member-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const subject = (personId: string, role: string | null): AccessSubject => ({ authenticated: true, personId, roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: role ? 'manager' : 'employee' });
const sheetsOf = (name: string) => (legacy as unknown as { name: string; sheets: Record<string, NhsoCell[][]> }[]).find((fixture) => fixture.name === name)!.sheets;
const REP = sheetsOf('rep with deny');
const STM = sheetsOf('stm three kinds');
const REP_NO = 'eclaim_11093_OP_25691103_213521803';
const STM_NO = '11093_OPUCS256910_02';

describeWithDatabase('FdhDocumentService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const protector = new NationalIdProtector(randomBytes(32).toString('hex'), randomBytes(32).toString('hex'));
  const service = new FdhDocumentService(database, protector);
  let manager: string; let viewer: string; let outsider: string;
  const insertPerson = async (name: string) => {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [id, randomUUID(), `${name} ${id.slice(0, 8)}`]);
    return id;
  };
  const audits = (action: string) => database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE action = ? AND actor_person_id = ?', [action, manager]);

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('DELETE FROM money_fdh_document');
    [manager, viewer, outsider] = await Promise.all([insertPerson('ผู้จัดการ'), insertPerson('ผู้ดู'), insertPerson('อื่น')]);
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: viewer, pages: ['fdh'] });
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: outsider, pages: ['nhso'] });
  });
  afterAll(async () => { await database.close(); });

  it('stores REP and STM encrypted, replaces a re-upload and audits only kind and row counts', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.upload(boss, { fileName: 'x.xls', sheets: REP })).toEqual({ ok: true, kind: 'rep', docNo: REP_NO, period: '', items: 2, replaced: false });
    expect(await service.upload(boss, { fileName: 'x.xls', sheets: REP })).toMatchObject({ ok: true, replaced: true });
    expect(await service.upload(boss, { fileName: 'STM_11093_OPUCS256910_02.xls', sheets: STM })).toEqual({ ok: true, kind: 'stm', docNo: STM_NO, period: '6910_OP_02', items: 3, replaced: false });
    const stored = await database.query<{ document_ciphertext: string }>('SELECT document_ciphertext FROM money_fdh_document');
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => !row.document_ciphertext.includes('1000000000001') && !row.document_ciphertext.includes('ทดสอบ'))).toBe(true);
    const listed = await service.list(boss);
    expect(listed.ok && listed.reps.map((row) => [row.docNo, row.hcode, row.hname, row.reportDate, row.count, row.sum, row.fileName])).toEqual([[REP_NO, '11093', 'รพ.วาริชภูมิ', '2026-11-06', 2, 905, 'x.xls']]);
    expect(listed.ok && listed.stms.map((row) => [row.docNo, row.period, row.count, row.sum])).toEqual([[STM_NO, '6910_OP_02', 3, 1611]]);
    const rows = await audits('money.fdh.upload');
    expect(rows.map((row) => row.metadata).sort()).toEqual([JSON.stringify({ kind: 'rep', rows: 2 }), JSON.stringify({ kind: 'rep', rows: 2 }), JSON.stringify({ kind: 'stm', rows: 3 })]);
  });

  it('gives page members the decrypted documents and refuses others', async () => {
    const all = await service.all(subject(viewer, null));
    expect(all.ok && all.reps[0]!.cases[0]!.pid).toBe('1000000000001');
    expect(all.ok && all.reps[0]).toMatchObject({ doc_no: REP_NO, file_name: 'x.xls' });
    expect(all.ok && all.stms[0]!.rows.map((row) => row.kind)).toEqual(['normal', 'appeal', 'd1']);
    expect(all.ok && /^\d{4}-\d{2}-\d{2}T/.test(all.stms[0]!.uploaded_at)).toBe(true);
    expect(await service.all(subject(outsider, null))).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.list(subject(outsider, null))).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.upload(subject(viewer, null), { fileName: 'x.xls', sheets: REP })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.remove(subject(viewer, null), 'rep', REP_NO)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('removes one document, then all of one kind, with audit', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.remove(boss, 'rep', REP_NO)).toEqual({ ok: true });
    expect(await service.remove(boss, 'rep', REP_NO)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.removeAll(boss, 'stm')).toEqual({ ok: true, removed: 1 });
    expect((await audits('money.fdh.remove')).map((row) => JSON.parse(row.metadata))).toEqual([{ kind: 'rep' }]);
    expect((await audits('money.fdh.remove_all')).map((row) => JSON.parse(row.metadata))).toEqual([{ kind: 'stm', documents: 1 }]);
    expect(await database.query('SELECT doc_no FROM money_fdh_document')).toEqual([]);
  });
});
