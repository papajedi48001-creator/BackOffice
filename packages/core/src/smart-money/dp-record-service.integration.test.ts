import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, NhsoCell } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { DpRecordService } from './dp-record-service';
import { MoneyMemberService } from './money-member-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const subject = (personId: string, role: string | null): AccessSubject => ({ authenticated: true, personId, roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: role ? 'manager' : 'employee' });
const HEADER = ['รหัสหน่วยบริการ', 'ชื่อหน่วยบริการ', 'วันที่รับบริการ', 'รหัสบัตรประชาชน', 'ชื่อ', 'นามสกุล', 'HN', 'ชื่อบริการฟื้นฟู', 'รวมราคาที่ขอเบิก', 'รวมราคาที่พึงเบิกได้', 'เลขที่อ้างอิง', 'สถานะ'];
const row = (ref: string, date: string, claim: number, eligible: number, status = ''): NhsoCell[] => ['11093', 'รพ.ทดสอบ', date, '1111111111119', 'ทดสอบ', 'สมมติ', '000000001', 'กายภาพบำบัด', claim, eligible, ref, status];

describeWithDatabase('DpRecordService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const protector = new NationalIdProtector(randomBytes(32).toString('hex'), randomBytes(32).toString('hex'));
  const service = new DpRecordService(database, protector);
  let manager: string; let viewer: string; let outsider: string;
  const insertPerson = async (name: string) => {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [id, randomUUID(), `${name} ${id.slice(0, 8)}`]);
    return id;
  };
  const audits = (action: string) => database.query<{ metadata: string }>('SELECT metadata FROM audit_event WHERE action = ? AND actor_person_id = ? ', [action, manager]);

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('DELETE FROM money_dp_record');
    await database.execute('DELETE FROM money_dp_upload');
    [manager, viewer, outsider] = await Promise.all([insertPerson('ผู้จัดการ'), insertPerson('ผู้ดู'), insertPerson('อื่น')]);
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: viewer, pages: ['disability'] });
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: outsider, pages: ['fdh'] });
  });
  afterAll(async () => { await database.close(); });

  it('adds, replaces and moves rows by เลขที่อ้างอิง with the legacy counts, logging one row per file and ปีงบ', async () => {
    const boss = subject(manager, 'money-manager');
    const first = randomUUID();
    expect(await service.upload(boss, { fileName: 'ฟื้นฟู ปี 69.csv', uploadId: first, rows: [HEADER, row('1', '30/9/2568', 150, 150), row('2', '1/10/2568', 150, 150)] }))
      .toEqual({ ok: true, hcode: '11093', hname: 'รพ.ทดสอบ', rows: 2, skipped: 0, added: 2, updated: 0, years: { 2568: 1, 2569: 1 } });
    expect(await service.upload(boss, { fileName: 'ฟื้นฟู ปี 69.csv', uploadId: first, rows: [HEADER, row('3', '2/10/2568', 150, 150), ['', '', 'x']] }))
      .toEqual({ ok: true, hcode: '11093', hname: 'รพ.ทดสอบ', rows: 1, skipped: 1, added: 1, updated: 0, years: { 2569: 1 } });
    expect(await service.upload(boss, { fileName: 'ฟื้นฟู ปี 70.csv', uploadId: randomUUID(), rows: [HEADER, row('3', '2/10/2568', 200, 150, 'D24'), row('4', '1/11/2568', 150, 150), row('4', '1/11/2568', 100, 100)] }))
      .toMatchObject({ ok: true, added: 1, updated: 2, years: { 2569: 3 } });
    expect(await service.upload(boss, { fileName: 'fix.csv', uploadId: randomUUID(), rows: [HEADER, row('1', '1/12/2568', 150, 150)] }))
      .toMatchObject({ ok: true, added: 0, updated: 1, years: { 2569: 1 } });

    const listed = await service.summaries(boss);
    expect(listed.ok && listed.years.map(({ updatedAt, ...year }) => ({ ...year, updated: /^\d{4}-\d{2}-\d{2}T/.test(updatedAt) }))).toEqual([
      { fy: 2569, count: 4, from: '2025-10-01', to: '2025-12-01', claim: 600, eligible: 550, flagged: 1, latestFile: 'fix.csv', updated: true }
    ]);
    const logs = await database.query<{ file_name: string; fy: number; row_count: number }>('SELECT file_name, fy, row_count FROM money_dp_upload ORDER BY uploaded_at, fy');
    expect(logs.map((log) => [log.file_name, log.fy, log.row_count])).toEqual([['ฟื้นฟู ปี 69.csv', 2568, 1], ['ฟื้นฟู ปี 69.csv', 2569, 2], ['ฟื้นฟู ปี 70.csv', 2569, 3], ['fix.csv', 2569, 1]]);
    expect((await audits('money.dp.upload')).map((audit) => audit.metadata).sort()).toEqual([
      JSON.stringify({ rows: 2, added: 2, updated: 0 }), JSON.stringify({ rows: 1, added: 1, updated: 0 }), JSON.stringify({ rows: 3, added: 1, updated: 2 }), JSON.stringify({ rows: 1, added: 0, updated: 1 })
    ].sort());
  });

  it('stores the record encrypted, with no เลขบัตร or name in clear', async () => {
    const stored = await database.query<{ record_ciphertext: string }>('SELECT record_ciphertext FROM money_dp_record');
    expect(stored.length).toBe(4);
    expect(stored.every((item) => !item.record_ciphertext.includes('1111111111119') && !item.record_ciphertext.includes('ทดสอบ') && !item.record_ciphertext.includes('000000001'))).toBe(true);
  });

  it('gives page members every record decrypted with its ปีงบ, and refuses others', async () => {
    const all = await service.all(subject(viewer, null));
    expect(all.ok && all.records.map((record) => [record.ref, record.fy, record.date, record.claim, record.status])).toEqual([
      ['2', 2569, '2025-10-01', 150, ''], ['3', 2569, '2025-10-02', 200, 'D24'], ['4', 2569, '2025-11-01', 100, ''], ['1', 2569, '2025-12-01', 150, '']
    ]);
    expect(all.ok && all.records[0]).toMatchObject({ cid: '1111111111119', name: 'ทดสอบ สมมติ', hn: '000000001', service: 'กายภาพบำบัด' });
    expect(all.ok && all.years.map((year) => year.fy)).toEqual([2569]);
    expect(await service.all(subject(outsider, null))).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.summaries(subject(outsider, null))).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await new DpRecordService(database, null).all(subject(viewer, null))).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
  });

  it('deletes a whole ปีงบ and its upload log, and audits fy and the count', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.removeYear(subject(viewer, null), 2569)).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.removeYear(boss, 2569)).toEqual({ ok: true, records: 4 });
    expect(await service.removeYear(boss, 2569)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await database.query('SELECT ref FROM money_dp_record')).toEqual([]);
    expect(await database.query('SELECT fy FROM money_dp_upload WHERE fy = 2569')).toEqual([]);
    expect((await audits('money.dp.remove')).map((audit) => audit.metadata)).toEqual([JSON.stringify({ fy: 2569, records: 4 })]);
  });
});
