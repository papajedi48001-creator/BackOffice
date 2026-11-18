import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { DpRecordService, type DpCipher } from './dp-record-service';

const untouched = new Proxy({}, { get: () => { throw new Error('database touched'); } }) as Database;
const cipher: DpCipher = { encrypt: (text) => `enc:${text}`, decrypt: (text) => text.slice(4) };
const manager: AccessSubject = { authenticated: true, personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: 'manager' };
const uploadId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const HEADER = ['วันที่รับบริการ', 'ชื่อบริการฟื้นฟู', 'รวมราคาที่ขอเบิก', 'รวมราคาที่พึงเบิกได้', 'เลขที่อ้างอิง'];

describe('DpRecordService', () => {
  it('refuses a person without money.manage before anything else', async () => {
    const service = new DpRecordService(untouched, cipher);
    expect(await service.upload({ ...manager, roles: [] }, { fileName: 'a.csv', uploadId, rows: [] })).toEqual({ ok: false, code: 'FORBIDDEN' });
    expect(await service.removeYear({ ...manager, roles: [] }, 2569)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('refuses to store patient data when the national-ID key is not set up', async () => {
    expect(await new DpRecordService(untouched, null).upload(manager, { fileName: 'a.csv', uploadId, rows: [HEADER] })).toEqual({ ok: false, code: 'NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) ติดต่อผู้ดูแลระบบ' });
  });

  it('returns the legacy messages for a file that is not a DP file or lacks a column, without touching the database', async () => {
    const service = new DpRecordService(untouched, cipher);
    expect(await service.upload(manager, { fileName: 'a.csv', uploadId, rows: [['a', 'b']] })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'ไม่ใช่ไฟล์ข้อมูลบริการฟื้นฟู (ไม่พบคอลัมน์ "เลขที่อ้างอิง" และ "ชื่อบริการฟื้นฟู")' });
    expect(await service.upload(manager, { fileName: 'a.csv', uploadId, rows: [HEADER.slice(1)] })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์ขาดคอลัมน์: วันที่รับบริการ' });
  });

  it('refuses a เลขที่อ้างอิง longer than 100 characters', async () => {
    expect(await new DpRecordService(untouched, cipher).upload(manager, { fileName: 'a.csv', uploadId, rows: [HEADER, ['1/10/2568', 'กายภาพบำบัด', '1', '1', 'R'.repeat(101)]] })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'เลขที่อ้างอิงยาวเกิน 100 ตัวอักษร' });
  });
});
