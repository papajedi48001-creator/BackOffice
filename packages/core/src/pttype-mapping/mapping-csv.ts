import { CSV_BOM, csvCell } from '../smart-money/dental-csv';
import type { MappedAccount, PttypeRight } from './pttype-mapping-hosxp';

const HEADER = ['รหัสสิทธิ', 'สิทธิการรักษา', 'รหัสผังบัญชี OPD', 'ผังบัญชี OPD', 'แก้ไข OPD ล่าสุด', 'รหัสผังบัญชี IPD', 'ผังบัญชี IPD', 'แก้ไข IPD ล่าสุด'];
const sideCells = (account: MappedAccount | null) => [account?.code ?? null, account?.name ?? null, account?.modifiedAt ?? null];

/** ส่งออกข้อมูล of the สิทธิ shown; UTF-8 with a BOM so Excel shows Thai. */
export function mappingCsv(rights: readonly PttypeRight[]): string {
  const lines = [HEADER.join(','), ...rights.map((right) => [right.code, right.name, ...sideCells(right.opd), ...sideCells(right.ipd)].map(csvCell).join(','))];
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}
