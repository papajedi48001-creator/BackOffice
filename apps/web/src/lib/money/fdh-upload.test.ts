import { describe, expect, it } from 'vitest';
import { fdhFileProblem, fdhUploadLine, FDH_ACCEPT } from './fdh-upload';

describe('fdh-upload helpers', () => {
  it('refuses temp files, other types and files over the limits before reading them', () => {
    expect(fdhFileProblem({ name: '~$eclaim.xls', size: 10 })).toBe('ข้ามไฟล์ชั่วคราวของ Excel');
    expect(fdhFileProblem({ name: 'eclaim.csv', size: 10 })).toBe('รับเฉพาะไฟล์ .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)');
    expect(fdhFileProblem({ name: 'eclaim.xls', size: 10 * 1024 * 1024 + 1 })).toBe('ไฟล์ใหญ่เกิน 10 MB');
    expect(fdhFileProblem({ name: 'month.zip', size: 50 * 1024 * 1024 })).toBeNull();
    expect(fdhFileProblem({ name: 'month.zip', size: 200 * 1024 * 1024 + 1 })).toBe('ไฟล์ .zip ใหญ่เกิน 200 MB');
    expect(fdhFileProblem({ name: 'STM.XLSX', size: 10 })).toBeNull();
    expect(FDH_ACCEPT).toBe('.xls,.xlsx,.zip');
  });

  it('writes the result line like the legacy page', () => {
    expect(fdhUploadLine('a.xls', { ok: true, kind: 'rep', docNo: 'eclaim_1', period: '', items: 1234, replaced: true })).toEqual({ ok: true, text: '✓ a.xls: REP eclaim_1 (1,234 เคส) — แทนที่ข้อมูลเดิม' });
    expect(fdhUploadLine('b.xls', { ok: true, kind: 'stm', docNo: 'STM_1', period: '6910_OP_02', items: 3, replaced: false })).toEqual({ ok: true, text: '✓ b.xls: STM STM_1 งวด 6910_OP_02 (3 แถว)' });
    expect(fdhUploadLine('c.xls', { ok: true, kind: 'stm', docNo: 'STM_2', period: '', items: 0, replaced: false }).text).toBe('✓ c.xls: STM STM_2 งวด - (0 แถว)');
    expect(fdhUploadLine('d.xls', { error: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' })).toEqual({ ok: false, text: '✗ d.xls: ไฟล์นี้ไม่ใช่ REP หรือ STM ของ FDH' });
  });
});
