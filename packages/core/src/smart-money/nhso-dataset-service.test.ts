import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { NhsoDatasetService } from './nhso-dataset-service';

const untouched = new Proxy({}, { get: () => { throw new Error('database touched'); } }) as Database;
const manager: AccessSubject = { authenticated: true, personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: 'manager' };

describe('NhsoDatasetService.upload', () => {
  it('returns the parser message for a table that is not a transfer report, without touching the database', async () => {
    expect(await new NhsoDatasetService(untouched).upload(manager, { fileName: 'a.xlsx', aoa: [] })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่ใช่รายงานโอนเงิน สปสช. (ไม่พบตารางข้อมูล)' });
  });

  it('refuses a ปีงบ outside 2500–2700 like the legacy store', async () => {
    const aoa = [['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ'], ['วันที่โอนตั้งแต่ 01/10/1900 ถึง 30/09/1901'], ['วันที่โอน', 'กองทุน', 'คงเหลือ', 'เงินโอนเข้าบัญชี'], ['1/10/1900', 'ก', 1, 1]];
    expect(await new NhsoDatasetService(untouched).upload(manager, { fileName: 'a.xlsx', aoa })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'รหัสหน่วยบริการหรือปีงบไม่ถูกต้อง' });
  });

  it('measures the stored table in UTF-8 bytes, so a Thai-heavy table under 12 M characters is still refused', async () => {
    const thai = 'ก'.repeat(1000);
    const rows = Array.from({ length: 5000 }, (_, index) => [`1/10/2568`, thai, index, 1]);
    const aoa = [['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ'], ['วันที่โอน', 'กองทุน', 'คงเหลือ', 'เงินโอนเข้าบัญชี'], ...rows];
    expect(await new NhsoDatasetService(untouched).upload(manager, { fileName: 'a.xlsx', aoa })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์ใหญ่เกินไป' });
  });

  it('refuses a person without money.manage before reading the table', async () => {
    expect(await new NhsoDatasetService(untouched).upload({ ...manager, roles: [] }, { fileName: 'a.xlsx', aoa: [] })).toEqual({ ok: false, code: 'FORBIDDEN' });
  });
});
