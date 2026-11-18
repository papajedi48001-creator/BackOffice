import { describe, expect, it } from 'vitest';
import { excelCell, fileProblem, uploadLine, NHSO_MAX_FILE_BYTES, NHSO_MAX_ZIP_BYTES } from './nhso-upload';

describe('nhso-upload helpers', () => {
  it('turns an Excel date cell into dd/mm/yyyy พ.ศ. and keeps other cells', () => {
    expect(excelCell(new Date(2026, 8, 5))).toBe('05/09/2569');
    expect(excelCell(12.5)).toBe(12.5);
    expect(excelCell('ก')).toBe('ก');
    expect(excelCell(undefined)).toBeNull();
    expect(excelCell(new Date('x'))).toBeNull();
  });

  it('refuses Excel temp files, files over 10 MB and other file types before reading them', () => {
    expect(fileProblem({ name: '~$report.xlsx', size: 10 })).toBe('ข้ามไฟล์ชั่วคราวของ Excel');
    expect(fileProblem({ name: 'report.xlsx', size: NHSO_MAX_FILE_BYTES + 1 })).toBe('ไฟล์ใหญ่เกิน 10 MB');
    expect(fileProblem({ name: 'report.pdf', size: 10 })).toBe('รองรับเฉพาะไฟล์ .xlsx .xls .xlsm .csv หรือ .zip');
    expect(fileProblem({ name: 'Report.XLSX', size: 10 })).toBeNull();
    expect(fileProblem({ name: 'all.zip', size: 10 })).toBeNull();
    expect(fileProblem({ name: 'all.zip', size: 60 * 1024 * 1024 })).toBeNull();
    expect(fileProblem({ name: 'all.zip', size: NHSO_MAX_ZIP_BYTES + 1 })).toBe('ไฟล์ .zip ใหญ่เกิน 200 MB');
  });

  it('writes the result line like the legacy page', () => {
    expect(uploadLine('a.xlsx', { ok: true, hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', fy: 2569, rows: 678, replaced: true })).toEqual({ ok: true, text: '✓ a.xlsx: นำเข้าแล้ว 11093 โรงพยาบาลวาริชภูมิ ปีงบ 2569 (678 แถว) — แทนที่ข้อมูลเดิม' });
    expect(uploadLine('a.xlsx', { ok: true, hcode: '11093', name: 'โรงพยาบาลวาริชภูมิ', fy: 2569, rows: 1, replaced: false }).text).toBe('✓ a.xlsx: นำเข้าแล้ว 11093 โรงพยาบาลวาริชภูมิ ปีงบ 2569 (1 แถว)');
    expect(uploadLine('a.xlsx', { error: 'INVALID_REPORT', message: 'ไฟล์นี้ไม่มีรายการโอน' })).toEqual({ ok: false, text: '✗ a.xlsx: ไฟล์นี้ไม่มีรายการโอน' });
    expect(uploadLine('a.xlsx', { error: 'FORBIDDEN' }).text).toBe('✗ a.xlsx: ไม่มีสิทธิ์ทำรายการนี้');
  });
});
