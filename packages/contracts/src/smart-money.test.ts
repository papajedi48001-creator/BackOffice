import { describe, expect, it } from 'vitest';
import { permissionModules } from './access.ts';
import { grantableRoleSchema, testerModuleCodes } from './admin.ts';
import { dentalGroupSchema, dentalPeriodSchema, MONEY_MODULE, moneyMemberInputSchema, moneyPageSchema, nhsoUploadSchema, fdhUploadSchema, fdhKindSchema } from './smart-money.ts';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';

describe('smart-money module wiring', () => {
  it('maps money.manage to the module and adds the manager and tester roles', () => {
    expect(MONEY_MODULE).toBe('smart-money');
    expect(permissionModules['money.manage']).toBe('smart-money');
    expect(grantableRoleSchema.safeParse('money-manager').success).toBe(true);
    expect(grantableRoleSchema.safeParse('smart-money-tester').success).toBe(true);
    expect(testerModuleCodes).toContain('smart-money');
  });
});

describe('moneyMemberInputSchema', () => {
  it('accepts a person with at least one page', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: ['dental'] }).success).toBe(true);
  });
  it('rejects a member with no page', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: [] }).success).toBe(false);
  });
  it('rejects an unknown page', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: ['x'] }).success).toBe(false);
  });
  it('rejects an extra key', () => {
    expect(moneyMemberInputSchema.safeParse({ personId: uuid, pages: ['dental'], role: 'HEAD' }).success).toBe(false);
  });
});

describe('dental filter enums', () => {
  it('lists the pages, groups and periods', () => {
    expect(moneyPageSchema.options).toEqual(['dental', 'nhso', 'fdh']);
    expect(dentalGroupSchema.options).toEqual(['pttype', 'paccount']);
    expect(dentalPeriodSchema.options).toEqual(['day', 'month']);
  });
});

describe('nhsoUploadSchema', () => {
  const table = [['หน่วยบริการ 11093 โรงพยาบาลวาริชภูมิ'], ['ลำดับ', 'วันที่โอน', 1.5, true, null]];
  it('accepts a file name and a table of strings, numbers, booleans and blanks', () => {
    expect(nhsoUploadSchema.safeParse({ fileName: 'nhso 11093 2569.xlsx', aoa: table }).success).toBe(true);
  });
  it('rejects 81 columns, a 1,001-character cell, 20,001 rows, an object cell and an extra key', () => {
    expect(nhsoUploadSchema.safeParse({ fileName: 'a.xlsx', aoa: [Array(81).fill('x')] }).success).toBe(false);
    expect(nhsoUploadSchema.safeParse({ fileName: 'a.xlsx', aoa: [['x'.repeat(1001)]] }).success).toBe(false);
    expect(nhsoUploadSchema.safeParse({ fileName: 'a.xlsx', aoa: Array(20001).fill([1]) }).success).toBe(false);
    expect(nhsoUploadSchema.safeParse({ fileName: 'a.xlsx', aoa: [[{}]] }).success).toBe(false);
    expect(nhsoUploadSchema.safeParse({ fileName: 'a.xlsx', aoa: table, hcode: '11093' }).success).toBe(false);
  });
  it('rejects an empty or long file name', () => {
    expect(nhsoUploadSchema.safeParse({ fileName: '', aoa: table }).success).toBe(false);
    expect(nhsoUploadSchema.safeParse({ fileName: 'a'.repeat(256), aoa: table }).success).toBe(false);
  });
});

describe('fdhUploadSchema', () => {
  const sheets = { Detail: [['REP No.', 'TRAN_ID'], ['691100011', 835483474, null, true]], 'Data DENY': [] };
  it('accepts a file name and up to 6 named sheets of rows', () => {
    expect(fdhUploadSchema.safeParse({ fileName: 'eclaim_11093_OP_1.xls', sheets }).success).toBe(true);
    expect(fdhKindSchema.options).toEqual(['rep', 'stm']);
  });
  it('rejects 7 sheets, 201 cells, 30,001 rows, a long sheet name and an extra key', () => {
    const seven = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`s${index}`, []]));
    expect(fdhUploadSchema.safeParse({ fileName: 'a.xls', sheets: seven }).success).toBe(false);
    expect(fdhUploadSchema.safeParse({ fileName: 'a.xls', sheets: { Detail: [Array(201).fill('x')] } }).success).toBe(false);
    expect(fdhUploadSchema.safeParse({ fileName: 'a.xls', sheets: { Detail: [Array(120).fill('x')] } }).success).toBe(true);
    expect(fdhUploadSchema.safeParse({ fileName: 'a.xls', sheets: { Detail: Array(30001).fill([1]) } }).success).toBe(false);
    expect(fdhUploadSchema.safeParse({ fileName: 'a.xls', sheets: { ['x'.repeat(101)]: [] } }).success).toBe(false);
    expect(fdhUploadSchema.safeParse({ fileName: 'a.xls', sheets, kind: 'rep' }).success).toBe(false);
  });
});
