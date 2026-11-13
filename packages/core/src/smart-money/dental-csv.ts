import type { DentalRow } from './dental-summary';

const BOM = String.fromCharCode(0xfeff);
const HEADER = ['VN', 'วันที่รับบริการ', 'HN', 'ชื่อ-สกุล', 'ICD-10', 'ชื่อโรค', 'รหัสสิทธิ', 'ชื่อสิทธิ', 'ผังบัญชี', 'ค่ารักษารวม', 'ชำระแล้ว', 'ยอดเรียกเก็บ'];

/** RFC 4180 quoting; a text cell Excel would run as a formula gets a leading `'`. */
function cell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) || text !== value ? `"${text.replace(/"/g, '""')}"` : text;
}

/** ส่งออก CSV with the legacy columns; UTF-8 with a BOM so Excel shows Thai. */
export function dentalCsv(rows: DentalRow[]): string {
  const lines = [HEADER.join(','), ...rows.map((row) => [row.vn, row.vstdate, row.hn, row.patientName, row.diagCode, row.diagName, row.pttypeCode, row.pttypeName, row.paccountName, row.totalAmount, row.paidMoney, row.claimAmount].map(cell).join(','))];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
