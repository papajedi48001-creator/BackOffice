/**
 * Point ฟื้นฟูผู้พิการ: reads the rehabilitation services file exported from the NHSO program (rows of cells, CSV or Excel) the
 * way the legacy `DpParser` did: the header row is found by column name in the first 10 rows, so column order does not matter.
 */
import type { NhsoCell } from '@backoffice/contracts';
import { phpString, phpTrim } from './fdh-report';

/** Column title in the file → field (all required). */
const REQUIRED = { 'วันที่รับบริการ': 'date', 'ชื่อบริการฟื้นฟู': 'service', 'รวมราคาที่ขอเบิก': 'claim', 'รวมราคาที่พึงเบิกได้': 'eligible', 'เลขที่อ้างอิง': 'ref' } as const;
/** Other columns read when present. */
const OPTIONAL = {
  'รหัสหน่วยบริการ': 'hcode', 'ชื่อหน่วยบริการ': 'hname', 'ครั้งที่': 'visit_no', 'รหัสบัตรประชาชน': 'cid', 'ชื่อ': 'fname', 'นามสกุล': 'lname', HN: 'hn', AN: 'an',
  'กลุ่มเป้าหมาย': 'target', 'ประเภทความพิการ': 'dis_type', ADL: 'adl', 'สิทธิหลัก': 'right', 'สิทธิย่อย': 'subright', 'ประเภทการรับบริการ': 'svc_type',
  'รหัสบริการฟื้นฟู': 'code', 'เริ่มบริการฟื้นฟู': 'start', 'สิ้นสุดบริการฟื้นฟู': 'end', ICD10: 'icd10', ICD9: 'icd9', 'ราคากลาง(ต่อหน่วย)': 'std_price',
  'ค่าบริการ(ต่อหน่วย)': 'charge_unit', 'ราคาที่จ่ายจริง(ต่อหน่วย)': 'paid_unit', 'ส่วนต่าง(ต่อหน่วย)': 'diff_unit', 'จำนวน': 'qty', 'วันที่บันทึก': 'saved',
  'เจ้าหน้าที่': 'staff', 'สถานะ': 'status'
} as const;
const MONEY = ['claim', 'eligible', 'std_price', 'charge_unit', 'paid_unit', 'diff_unit', 'qty'] as const;
const HEADER_SCAN_ROWS = 10;

/** One service row (the field names of the legacy store, which the dashboard also reads). */
export type DpRecord = {
  ref: string; date: string; visit_no: number; cid: string; name: string; hn: string; an: string; target: string; dis_type: string; adl: string;
  right: string; subright: string; svc_type: string; code: string; service: string; icd10: string; icd9: string; staff: string; status: string;
  claim: number; eligible: number; std_price: number; charge_unit: number; paid_unit: number; diff_unit: number; qty: number; saved: string; start: string; end: string;
};
export type DpParsed = { hcode: string; hname: string; records: DpRecord[]; skipped: number };
export type DpParseResult = ({ ok: true } & DpParsed) | { ok: false; message: string };
type Rows = readonly (readonly NhsoCell[] | null | undefined)[];

export const DP_NOT_DP_MESSAGE = 'ไม่ใช่ไฟล์ข้อมูลบริการฟื้นฟู (ไม่พบคอลัมน์ "เลขที่อ้างอิง" และ "ชื่อบริการฟื้นฟู")';

/** `DpParser::text`: blank for null/true/false, whole numbers without decimals, text trimmed. */
function text(value: NhsoCell | undefined): string {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  return phpTrim(phpString(value));
}
/** `preg_replace('/\s+/u', ' ')` then trim (PCRE Unicode whitespace, which leaves out U+FEFF unlike JavaScript `\s`). */
const collapse = (s: string) => phpTrim(s.replace(/[^\S﻿]+/gu, ' '));
function number(s: string): number {
  const t = s.replace(/[, ]/g, '');
  return /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(t) ? Number(t) : 0;
}
/** "d/m/yyyy" (พ.ศ. or ค.ศ., time allowed after it) or "yyyy-mm-dd" → ISO ค.ศ.; an impossible date → ''. */
function isoDate(s: string): string {
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return '';
  if (y > 2400) y -= 543;
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return '';
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, mo: number) => (mo === 2 ? (leap(y) ? 29 : 28) : [4, 6, 9, 11].includes(mo) ? 30 : 31);
/** "D24," → "D24"; " D24, 305 " → "D24,305". */
const status = (s: string) => s.split(',').map(phpTrim).filter((part) => part !== '').join(',');

function findHeader(rows: Rows): [number, Map<string, number>] | null {
  const n = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cols = new Map<string, number>();
    row.forEach((value, index) => {
      const t = collapse(text(value).replaceAll('﻿', ''));
      if (t !== '' && !cols.has(t)) cols.set(t, index);
    });
    if (cols.has('เลขที่อ้างอิง') && cols.has('ชื่อบริการฟื้นฟู')) return [i, cols];
  }
  return null;
}

/** `DpParser::isDp`: a header row with "เลขที่อ้างอิง" and "ชื่อบริการฟื้นฟู" in the first 10 rows. */
export function isDp(rows: Rows): boolean {
  return findHeader(rows) !== null;
}

/** `DpParser::parse`, with the legacy Thai messages for a file that is not a DP file or lacks a required column. */
export function parseDp(rows: Rows): DpParseResult {
  const header = findHeader(rows);
  if (!header) return { ok: false, message: DP_NOT_DP_MESSAGE };
  const [at, cols] = header;
  const missing = Object.keys(REQUIRED).filter((title) => !cols.has(title));
  if (missing.length) return { ok: false, message: `ไฟล์ขาดคอลัมน์: ${missing.join(', ')}` };
  const map: [string, number][] = [];
  for (const [title, field] of Object.entries({ ...REQUIRED, ...OPTIONAL })) if (cols.has(title)) map.push([field, cols.get(title)!]);

  const records: DpRecord[] = [];
  let skipped = 0;
  let hcode = '';
  let hname = '';
  for (let i = at + 1; i < rows.length; i++) {
    const row = Array.isArray(rows[i]) ? rows[i]! : [];
    const raw: Record<string, string> = {};
    for (const [field, index] of map) raw[field] = text(row[index]);
    if (Object.values(raw).join('') === '') continue;
    const date = isoDate(raw.date!);
    if (raw.ref === '' || date === '') { skipped++; continue; }
    const get = (field: string) => raw[field] ?? '';
    const record = {
      ref: raw.ref!, date, visit_no: Math.trunc(number(get('visit_no'))), cid: get('cid'), name: phpTrim(`${get('fname')} ${get('lname')}`), hn: get('hn'), an: get('an'),
      target: get('target'), dis_type: get('dis_type'), adl: get('adl'), right: get('right'), subright: get('subright'), svc_type: get('svc_type'), code: get('code'),
      service: collapse(raw.service!), icd10: get('icd10'), icd9: get('icd9'), staff: get('staff'), status: status(get('status'))
    } as DpRecord;
    for (const key of MONEY) record[key] = number(get(key));
    for (const key of ['saved', 'start', 'end'] as const) record[key] = isoDate(get(key));
    if (hcode === '' && get('hcode') !== '') { hcode = get('hcode'); hname = get('hname'); }
    records.push(record);
  }
  return { ok: true, hcode, hname, records, skipped };
}

/** ปีงบประมาณ (พ.ศ.) of an ISO date: October to September. */
export function dpFiscalYear(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y + 543 + (m >= 10 ? 1 : 0);
}
