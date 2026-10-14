import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads quoted cells, escaped quotes, CRLF, a BOM, and Thai text', () => {
    expect(parseCsv('﻿code,name\r\nNUR,"งานการพยาบาล, ผู้ป่วยใน"\r\nLAB,"ห้อง ""ปฏิบัติการ"""\r\n')).toEqual([
      ['code', 'name'], ['NUR', 'งานการพยาบาล, ผู้ป่วยใน'], ['LAB', 'ห้อง "ปฏิบัติการ"']
    ]);
  });

  it('keeps a line break inside quotes and skips blank lines', () => {
    expect(parseCsv('a,b\n"line 1\nline 2",x\n\n')).toEqual([['a', 'b'], ['line 1\nline 2', 'x']]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a,b\n"open,x\n')).toThrow('INVALID_CSV');
  });
});
