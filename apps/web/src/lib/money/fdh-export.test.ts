import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { fdhWorkbook } from './fdh-export';

describe('fdhWorkbook', () => {
  it('puts each sheet in order with its rows, and an empty sheet still exists', () => {
    const book = fdhWorkbook(XLSX, { 'รายเคส': [{ VN: 'A', 'เรียกเก็บ': 100 }], 'รายกองทุนย่อย': [], 'รายบุคคลแยกกองทุน': [], 'รายกองทุน-HN-VN': [], 'แยกกองทุนต่อ VN': [] });
    expect(book.SheetNames).toEqual(['รายเคส', 'รายกองทุนย่อย', 'รายบุคคลแยกกองทุน', 'รายกองทุน-HN-VN', 'แยกกองทุนต่อ VN']);
    expect(XLSX.utils.sheet_to_json(book.Sheets['รายเคส']!)).toEqual([{ VN: 'A', 'เรียกเก็บ': 100 }]);
  });
});
