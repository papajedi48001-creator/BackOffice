import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, NhsoCell } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { NationalIdProtector } from '../crypto/national-id';
import { ImcService } from './imc-service';
import { MoneyMemberService } from './money-member-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const subject = (personId: string, role: string | null): AccessSubject => ({ authenticated: true, personId, roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: role ? 'manager' : 'employee' });
const REGISTER = ['ชื่อ', 'นามสกุล', 'HN', 'วันที่เริ่มป่วย', 'โรค', 'วันที่จำหน่ายจากผู้ป่วยใน', 'วันที่ครบกำหนดการให้บริการ', 'สถานะ', 'วันที่ให้บริการ', 'ครั้งที่', 'รหัสบริการ', 'ชื่อบริการ', 'รวมราคาที่ขอเบิก', 'สถานะ'];
const reg = (hn: string, date: string, visit: number, code: string, claim: number): NhsoCell[] => ['ทดสอบ', `สมมติ${hn}`, hn, '27/9/2568', 'Stroke', '6/10/2568', '4/4/2569', 'ปกติ', date, visit, code, 'กายภาพบำบัด', claim, 'ผ่าน'];
const REP_MAIN = ['ลำดับที่', 'REP No.', 'Trans ID', 'HN', 'ชื่อ-สกุล', 'วันที่รับบริการ', 'ลำดับที่', 'รายการประเภทที่ขอเบิก', 'เรียกเก็บ', 'ชดเชย', null, null, 'สถานะ'];
const REP_SUB = [null, null, null, null, null, null, null, null, 'รวมเงินที่ขอเบิก', 'ชดเชย', 'จ่ายเพิ่ม', 'เรียกคืน'];
const rep = (trans: string, hn: string, date: string, paid: number): NhsoCell[] => ['1', 'DDSA69022800075', trans, hn, 'นายทดสอบ สมมติ', date, '1', 'กายภาพบำบัด_IMC', 450, paid, 0, 0, 'ชดเชย'];

describeWithDatabase('ImcService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const protector = new NationalIdProtector(randomBytes(32).toString('hex'), randomBytes(32).toString('hex'));
  const service = new ImcService(database, protector);
  let manager: string; let viewer: string; let outsider: string;
  const insertPerson = async (name: string) => {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [id, randomUUID(), `${name} ${id.slice(0, 8)}`]);
    return id;
  };

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('DELETE FROM money_imc_visit');
    await database.execute('DELETE FROM money_imc_rep');
    [manager, viewer, outsider] = await Promise.all([insertPerson('ผู้จัดการ'), insertPerson('ผู้ดู'), insertPerson('อื่น')]);
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: viewer, pages: ['disability'] });
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: outsider, pages: ['fdh'] });
  });
  afterAll(async () => { await database.close(); });

  it('adds and then replaces register lines by line key, and REP lines by REP No., Trans ID and ลำดับที่, auditing counts only', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.upload(boss, { kind: 'register', fileName: 'ทะเบียน IMC.csv', uploadId: randomUUID(), rows: [REGISTER, reg('900001', '27/10/2568', 1, 'H9339.1', 450), reg('900001', '3/11/2568', 2, 'H9340', 200)] }))
      .toEqual({ ok: true, kind: 'register', rows: 2, added: 2, updated: 0, skipped: 0 });
    expect(await service.upload(boss, { kind: 'register', fileName: 'ทะเบียน IMC.csv', uploadId: randomUUID(), rows: [REGISTER, reg('900001', '3/11/2568', 2, 'H9340', 250), reg('900002', '1/12/2568', 1, 'H9339.1', 450), ['x']] }))
      .toEqual({ ok: true, kind: 'register', rows: 2, added: 1, updated: 1, skipped: 1 });
    expect(await service.upload(boss, { kind: 'rep', fileName: 'REP.xlsx', uploadId: randomUUID(), rows: [REP_MAIN, REP_SUB, rep('T1', '900001', '27/10/2568', 450), rep('T2', '700000', '27/10/2568', 300)] }))
      .toEqual({ ok: true, kind: 'rep', rows: 2, added: 2, updated: 0, skipped: 0 });
    expect(await service.upload(boss, { kind: 'rep', fileName: 'REP.xlsx', uploadId: randomUUID(), rows: [REP_MAIN, REP_SUB, rep('T1', '900001', '27/10/2568', 400)] }))
      .toMatchObject({ ok: true, added: 0, updated: 1 });
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'money.imc.upload' AND actor_person_id = ?", [manager]);
    expect(audits.map((audit) => JSON.parse(audit.metadata) as unknown)).toEqual(expect.arrayContaining([{ kind: 'register', rows: 2, added: 2, updated: 0 }, { kind: 'rep', rows: 1, added: 0, updated: 1 }]));
    expect(audits.every((audit) => !audit.metadata.includes('9000') && !audit.metadata.includes('ทดสอบ'))).toBe(true);
  });

  it('stores names and HN only encrypted', async () => {
    const stored = [...await database.query<{ record_ciphertext: string }>('SELECT record_ciphertext FROM money_imc_visit'), ...await database.query<{ record_ciphertext: string }>('SELECT record_ciphertext FROM money_imc_rep')];
    expect(stored).toHaveLength(5);
    expect(stored.every((item) => !item.record_ciphertext.includes('900001') && !item.record_ciphertext.includes('ทดสอบ'))).toBe(true);
  });

  it('refuses a wrong file, a non-manager upload and a missing key', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.upload(boss, { kind: 'register', fileName: 'บริการ.csv', uploadId: randomUUID(), rows: [['รหัสบัตรประชาชน', 'ชื่อ', 'นามสกุล', 'วันที่รับบริการ', 'รหัสบริการ', 'จำนวนเงิน']] }))
      .toEqual({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า ข้อมูลเดียวกันอยู่ในทะเบียนคนไข้ IMC แล้ว' });
    expect(await service.upload(boss, { kind: 'rep', fileName: 'x.csv', uploadId: randomUUID(), rows: [REGISTER] })).toMatchObject({ ok: false, code: 'INVALID_REPORT' });
    expect(await service.upload(subject(viewer, null), { kind: 'rep', fileName: 'x.csv', uploadId: randomUUID(), rows: [REP_MAIN] })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await new ImcService(database, null).upload(boss, { kind: 'rep', fileName: 'x.csv', uploadId: randomUUID(), rows: [REP_MAIN] })).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
  });

  it('gives page members the overview and refuses others', async () => {
    const overview = await service.overview(subject(viewer, null));
    expect(overview.ok).toBe(true);
    if (!overview.ok) return;
    expect(overview.persons.map((person) => [person.name, person.visits, person.claim, person.paid, person.repNos])).toEqual([
      ['ทดสอบ สมมติ900001', 2, 700, 400, ['DDSA69022800075']], ['ทดสอบ สมมติ900002', 1, 450, 0, []]
    ]);
    expect(overview.totals).toMatchObject({ people: 2, visits: 3, claim: 1150, paid: 700, repOutside: 1, noRep: 700 });
    expect(overview.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await service.overview(subject(outsider, null))).toEqual({ ok: false, code: 'FORBIDDEN' });
  });
});
