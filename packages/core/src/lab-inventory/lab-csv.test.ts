import { describe, expect, it } from 'vitest';
import { itemTemplateCsv, openingTemplateCsv, parseItemCsv, parseOpeningCsv } from './lab-csv';

const BOM = '﻿';
const lookup = {
  storeIdByCode: (code: string) => ({ 'คลังหลัก': 'main', CHEM: 'chem' } as Record<string, string>)[code] ?? null,
  itemIdByCode: (code: string) => ({ 'CBC-01': 'item-cbc', GLU: 'item-glu' } as Record<string, string>)[code] ?? null
};

describe('item register CSV', () => {
  it('reads an Excel CSV with BOM, CRLF and a trailing blank line', () => {
    const text = `${BOM}รหัส,ชื่อ,หน่วยรับ,หน่วยใช้,อัตราแปลง,จุดสั่งซื้อคลังหลัก\r\nCBC-01,"น้ำยา CBC, 500 ml",กล่อง,ขวด,10,5\r\nGLU,Glucose,ชุด,test,100,\r\n\r\n`;
    expect(parseItemCsv(text)).toEqual({ ok: true, rows: [
      { code: 'CBC-01', name: 'น้ำยา CBC, 500 ml', receiveUnit: 'กล่อง', useUnit: 'ขวด', unitsPerReceive: 10, mainReorderPoint: 5 },
      { code: 'GLU', name: 'Glucose', receiveUnit: 'ชุด', useUnit: 'test', unitsPerReceive: 100, mainReorderPoint: 0 }
    ] });
  });
  it('rejects the whole file with row numbers when a row is wrong or repeated', () => {
    const text = 'รหัส,ชื่อ,หน่วยรับ,หน่วยใช้,อัตราแปลง,จุดสั่งซื้อคลังหลัก\nCBC-01,CBC,กล่อง,ขวด,0,\nCBC-01,CBC,กล่อง,ขวด,10,\nCBC-01,CBC,กล่อง,ขวด,10,';
    const result = parseItemCsv(text);
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.map((error) => error.row)).toEqual([2, 4]);
  });
  it('rejects a file with the wrong header', () => {
    expect(parseItemCsv('code,name\nA,B')).toMatchObject({ ok: false, errors: [{ row: 1 }] });
  });
});

describe('opening balance CSV', () => {
  const header = 'คลัง,รหัสวัสดุ,เลขล็อต,วันหมดอายุ,จำนวนหน่วยใช้,ต้นทุนต่อหน่วยใช้';
  it('reads ISO and Buddhist-era dates and an empty expiry', () => {
    const text = `${header}\nคลังหลัก,CBC-01,L1,2027-01-31,20,125\nCHEM,CBC-01,L1,31/12/2569,5,125.5\nCHEM,GLU,G9,,100,2.4567`;
    expect(parseOpeningCsv(text, lookup)).toEqual({ ok: true, rows: [
      { row: 2, storeId: 'main', itemId: 'item-cbc', lotNo: 'L1', expiryDate: '2027-01-31', quantity: 20, unitCost: 125 },
      { row: 3, storeId: 'chem', itemId: 'item-cbc', lotNo: 'L1', expiryDate: '2026-12-31', quantity: 5, unitCost: 125.5 },
      { row: 4, storeId: 'chem', itemId: 'item-glu', lotNo: 'G9', expiryDate: null, quantity: 100, unitCost: 2.4567 }
    ] });
  });
  it('names the row of an unknown item, unknown store, bad date, bad quantity and a duplicate lot', () => {
    const text = `${header}\nคลังหลัก,CBC-01,L1,2027-01-31,20,125\nคลังหลัก,NOPE,L1,,1,1\nXX,CBC-01,L1,,1,1\nคลังหลัก,CBC-01,L2,31/02/2027,1,1\nคลังหลัก,CBC-01,L3,,1.5,1\nคลังหลัก,CBC-01,L1,2027-01-31,3,125`;
    const result = parseOpeningCsv(text, lookup);
    expect(result.ok ? [] : result.errors.map((error) => error.row)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('templates', () => {
  it('start with a BOM and parse back to zero rows', () => {
    expect(itemTemplateCsv().startsWith(BOM)).toBe(true);
    expect(openingTemplateCsv().startsWith(BOM)).toBe(true);
    expect(parseItemCsv(itemTemplateCsv())).toEqual({ ok: true, rows: [] });
    expect(parseOpeningCsv(openingTemplateCsv(), lookup)).toEqual({ ok: true, rows: [] });
  });
});
