import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccessSubject, NhsoCell } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { MoneyMemberService } from './money-member-service';
import { NhsoDatasetService } from './nhso-dataset-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const subject = (personId: string, role: string | null): AccessSubject => ({ authenticated: true, personId, roles: role ? [{ name: role, organizationId: null }] : [], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: role ? 'manager' : 'employee' });

const HEAD = ['ลำดับ', 'วันที่โอน', 'กองทุน', 'คงเหลือ', 'เงินโอนเข้าบัญชี'];
const report = (hcode: string, name: string, range: string, transfer: number): NhsoCell[][] => [
  ['รายงานเอกสารการโอนเงินแยกตามหน่วยงาน'], [`หน่วยบริการ ${hcode} ${name}`], [`วันที่โอนตั้งแต่ ${range}`], HEAD,
  [1, '25 ก.ย. 2569', 'กองทุนผู้ป่วยใน', transfer, transfer], ['รวม', null, null, transfer, transfer]
];

describeWithDatabase('NhsoDatasetService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new NhsoDatasetService(database);
  let manager: string; let viewer: string; let outsider: string;
  const insertPerson = async (name: string) => {
    const id = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [id, randomUUID(), `${name} ${id.slice(0, 8)}`]);
    return id;
  };
  const audits = (action: string) => database.query<{ metadata: string; actor_person_id: string; target_id: string }>('SELECT metadata, actor_person_id, target_id FROM audit_event WHERE action = ? AND actor_person_id = ?', [action, manager]);

  beforeAll(async () => {
    await runMigrations(database);
    await database.execute('DELETE FROM money_nhso_dataset');
    [manager, viewer, outsider] = await Promise.all([insertPerson('ผู้จัดการ'), insertPerson('ผู้ดู'), insertPerson('อื่น')]);
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: viewer, pages: ['nhso'] });
    await new MoneyMemberService(database).saveMember(subject(manager, 'money-manager'), { personId: outsider, pages: ['dental'] });
  });
  afterAll(async () => { await database.close(); });

  it('stores a report, replaces it on a second upload and audits only ปีงบ and row counts', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.upload(boss, { fileName: 'a.xlsx', aoa: report('11093', 'โรงพยาบาลวาริชภูมิ', '01/10/2568 ถึง 30/09/2569', 100) })).toEqual({ ok: true, hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', fy: 2569, rows: 1, replaced: false });
    expect(await service.upload(boss, { fileName: 'b.xlsx', aoa: report('11093', 'โรงพยาบาลวาริชภูมิ', '01/10/2568 ถึง 30/09/2569', 250.75) })).toMatchObject({ ok: true, replaced: true });
    await service.upload(boss, { fileName: 'c.xlsx', aoa: report('11099', 'โรงพยาบาลพระอาจารย์วัน', '01/10/2569 ถึง 22/10/2569', 10) });
    await service.upload(boss, { fileName: 'd.xlsx', aoa: report('10701', 'โรงพยาบาลอื่น', '01/10/2568 ถึง 30/09/2569', 5) });
    const listed = await service.list(boss);
    expect(listed.ok && listed.datasets.map((row) => `${row.fy}:${row.hcode}`)).toEqual(['2569:10701', '2569:11093', '2570:11099']);
    expect(listed.ok && listed.datasets[1]).toMatchObject({ hcode: '11093', fileName: 'b.xlsx', rowCount: 1, transferTotal: 250.75, dateFrom: '2025-10-01', dateTo: '2026-09-30' });
    expect(listed.ok && 'rows' in listed.datasets[1]!).toBe(false);
    const rows = await audits('money.nhso.upload');
    expect(rows.map((row) => row.metadata).sort().map((text) => JSON.parse(text))).toEqual([{ fiscalYear: 2569, rows: 1 }, { fiscalYear: 2569, rows: 1 }, { fiscalYear: 2569, rows: 1 }, { fiscalYear: 2570, rows: 1 }]);
    expect(rows.every((row) => !row.metadata.includes('วาริชภูมิ'))).toBe(true);
  });

  it('gives the page members every dataset with rows and refuses others', async () => {
    const all = await service.all(subject(viewer, null));
    expect(all.ok && all.datasets.find((row) => row.hcode === '11093')!.rows[1]).toEqual(['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ']);
    expect(await service.all(subject(outsider, null))).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.upload(subject(viewer, null), { fileName: 'a.xlsx', aoa: report('11093', 'x', '01/10/2568 ถึง 30/09/2569', 1) })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.remove(subject(viewer, null), '11093', 2569)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('removes one dataset, then all of them, with audit', async () => {
    const boss = subject(manager, 'money-manager');
    expect(await service.remove(boss, '11093', 2569)).toEqual({ ok: true });
    expect(await service.remove(boss, '11093', 2569)).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect(await service.removeAll(boss)).toEqual({ ok: true, removed: 2 });
    const listed = await service.list(boss);
    expect(listed.ok && listed.datasets).toEqual([]);
    expect((await audits('money.nhso.remove')).map((row) => [row.target_id, JSON.parse(row.metadata)])).toEqual([['11093-2569', { fiscalYear: 2569 }]]);
    expect((await audits('money.nhso.remove_all')).map((row) => JSON.parse(row.metadata))).toEqual([{ datasets: 2 }]);
  });
});
