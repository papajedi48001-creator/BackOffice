import { describe, expect, it } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { FdhDocumentService, packFdhDocument, unpackFdhDocument, type FdhCipher } from './fdh-document-service';

const untouched = new Proxy({}, { get: () => { throw new Error('database touched'); } }) as Database;
const cipher: FdhCipher = { encrypt: (text) => `enc:${text}`, decrypt: (text) => text.slice(4) };
const manager: AccessSubject = { authenticated: true, personId: '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10', roles: [{ name: 'money-manager', organizationId: null }], dataOwnerModules: [], hospitalWideDataOwnerModules: [], activeRole: 'manager' };
const sheets = { Sheet1: [['a']] };

describe('FdhDocumentService.upload', () => {
  it('refuses a person without money.manage before anything else', async () => {
    expect(await new FdhDocumentService(untouched, cipher).upload({ ...manager, roles: [] }, { fileName: 'a.xls', sheets })).toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('refuses to store patient data when the national-ID key is not set up', async () => {
    expect(await new FdhDocumentService(untouched, null).upload(manager, { fileName: 'a.xls', sheets })).toEqual({ ok: false, code: 'NOT_CONFIGURED', message: 'ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) ติดต่อผู้ดูแลระบบ' });
  });

  it('accepts only .xls and .xlsx files, like the legacy page', async () => {
    expect(await new FdhDocumentService(untouched, cipher).upload(manager, { fileName: 'a.csv', sheets })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'รับเฉพาะไฟล์ .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)' });
  });

  it('returns the legacy message for a workbook that is neither REP nor STM, without touching the database', async () => {
    expect(await new FdhDocumentService(untouched, cipher).upload(manager, { fileName: 'a.xls', sheets })).toEqual({ ok: false, code: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' });
  });
});

describe('packFdhDocument', () => {
  it('compresses the parsed document so a 30,000-row STM fits the stored size, and unpacks it again', () => {
    const row = { kind: 'normal', rep_no: '691100011', tran_id: '835483474', hn: '000000001', pid: '1000000000001', name: 'นาย ทดสอบ หนึ่ง', visit_date: '2026-10-28', op: 0, fs: 80, total: 80, seq: '700100' };
    const json = JSON.stringify({ type: 'stm', rows: Array.from({ length: 30000 }, (_, at) => ({ ...row, seq: String(700100 + at), tran_id: String(835483474 + at) })) });
    expect(Buffer.byteLength(json, 'utf8')).toBeGreaterThan(10 * 1024 * 1024 / 2);
    const packed = packFdhDocument(json);
    expect(packed.startsWith('z1:')).toBe(true);
    expect(packed.length).toBeLessThan(json.length / 5);
    expect(packed).not.toContain('1000000000001');
    expect(unpackFdhDocument(packed)).toBe(json);
  });

  it('still reads a document stored as plain JSON', () => {
    expect(unpackFdhDocument('{"type":"rep"}')).toBe('{"type":"rep"}');
  });
});
