import { describe, expect, it, vi } from 'vitest';
import { exportPeople, peopleCsv } from './people-export';

const person = { id: 'p1', employeeCode: 'RN001', displayName: '=HYPERLINK("x")', positionTitle: 'พยาบาลวิชาชีพ', employmentStatus: 'ACTIVE', nationalIdMasked: 'X-XXXX-XXXXX-12-3', employmentTypeName: 'ข้าราชการ', organizationName: null, organizationCode: null };

describe('peopleCsv', () => {
  it('writes the table columns for Excel, the masked ID only, and no formulas', () => {
    const csv = peopleCsv([person, { ...person, id: 'p2', displayName: 'นายสมชาย ใจดี', employmentStatus: 'INACTIVE', employeeCode: null }]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('"รหัสบุคลากร","ชื่อ-นามสกุล","ตำแหน่งงาน","ประเภทการจ้าง","หน่วยงาน","เลขประจำตัวประชาชน","สถานะ"');
    expect(lines[1]).toBe('"RN001","\'=HYPERLINK(""x"")","พยาบาลวิชาชีพ","ข้าราชการ","ยังไม่ระบุ","X-XXXX-XXXXX-12-3","คงอยู่"');
    expect(lines[2]).toBe('"ยังไม่ระบุ","นายสมชาย ใจดี","พยาบาลวิชาชีพ","ข้าราชการ","ยังไม่ระบุ","X-XXXX-XXXXX-12-3","ลาออก"');
  });
});

describe('exportPeople', () => {
  it('records one audit row with the row count and no personal data, inside a transaction', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { execute, query: vi.fn() };
    const database = { transaction: vi.fn(async (work: (db: typeof tx) => Promise<unknown>) => work(tx)) };
    const csv = await exportPeople(database as never, 'actor-1', [person]);
    expect(csv).toContain('RN001');
    expect(database.transaction).toHaveBeenCalledTimes(1);
    const params = JSON.stringify(execute.mock.calls);
    expect(params).toContain('hr.people.export');
    expect(params).toContain('\\"rows\\":1');
    expect(params).toContain('\\"exportKind\\":\\"people\\"');
    expect(params).not.toContain('RN001');
    expect(params).not.toContain('X-XXXX');
  });
});
