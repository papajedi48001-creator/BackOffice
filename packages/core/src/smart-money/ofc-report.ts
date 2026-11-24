import type { NhsoCell } from '@backoffice/contracts';
import { fdhIsoDate, fdhNum, fdhStr, type FdhSheets } from './fdh-report';

/** One Data Instrument line of an OFC REP (eclaim OPCS); `vn` is the REP's SEQ NO. No name, HN or PID is kept. */
export type OfcRepLine = { repNo: string; tranId: string; itemNo: number; vn: string; date: string; adp: string; itemName: string; qty: number; claim: number; paid: number; deny: string; error: string };
/** One row of an OFC Statement (STM … OP, sheet พึงรับ); `inst` is ค่าอวัยวะฯ, `vn` the SEQ NO. */
export type OfcStmLine = { docNo: string; repNo: string; vn: string; date: string; claim: number; inst: number; total: number };
export type OfcParsed<T> = ({ ok: true; lines: T[]; skipped: number } & (T extends OfcStmLine ? { docNo: string } : unknown)) | { ok: false; message: string };

type Table = readonly (readonly NhsoCell[] | null | undefined)[];
const cell = (row: readonly NhsoCell[] | null | undefined, at: number) => (at < 0 ? '' : fdhStr(row?.[at] ?? ''));
const norm = (value: string) => value.replace(/\s+/g, ' ').trim();
/** `-` is how the REP writes "nothing". */
const clean = (value: string) => (value === '-' ? '' : value);
const day = (value: string) => fdhIsoDate(value.replace(/\s+/g, ' ').replace(/ \//g, '/').replace(/\/ /g, '/'), false);
const sheetOf = (sheets: FdhSheets, test: (name: string) => boolean): Table | null => {
  const name = Object.keys(sheets).find((key) => test(key.trim()));
  return name ? (sheets[name] ?? []) : null;
};
const findRow = (table: Table, test: (row: readonly NhsoCell[]) => boolean, from = 0) => {
  for (let i = from; i < table.length; i++) if (test(table[i] ?? [])) return i;
  return -1;
};
const columnOf = (row: readonly NhsoCell[] | null | undefined, label: string, from = 0) => {
  for (let i = from; i < (row?.length ?? 0); i++) if (norm(cell(row, i)) === label) return i;
  return -1;
};

const REP_DETAIL = (name: string) => name === 'Detail';
const REP_INSTRUMENT = (name: string) => name === 'Data Instrument';
const STM_SHEET = (name: string) => name === 'พึงรับ';

/** REP when it has Detail and Data Instrument, Statement when it has the พึงรับ sheet. */
export function ofcFileKind(sheets: FdhSheets): 'rep' | 'stm' | null {
  if (sheetOf(sheets, REP_DETAIL) && sheetOf(sheets, REP_INSTRUMENT)) return 'rep';
  if (sheetOf(sheets, STM_SHEET)) return 'stm';
  return null;
}

const NOT_REP = 'ไม่ใช่ไฟล์ REP ของ OFC (ต้องมีชีต Detail และ Data Instrument)';
const NOT_STM = 'ไม่ใช่ไฟล์ Statement ของ OFC (ต้องมีชีตพึงรับ และเลขที่เอกสาร)';

/** Each Data Instrument line, joined to Detail by TRAN_ID for its REP and SEQ NO; a line whose TRAN_ID is not in Detail is skipped. */
export function parseOfcRep(sheets: FdhSheets): OfcParsed<OfcRepLine> {
  const detail = sheetOf(sheets, REP_DETAIL);
  const items = sheetOf(sheets, REP_INSTRUMENT);
  if (!detail || !items) return { ok: false, message: NOT_REP };
  const head = findRow(detail, (row) => norm(cell(row, 0)) === 'REP' && columnOf(row, 'TRAN_ID') >= 0 && columnOf(row, 'SEQ NO') >= 0);
  if (head < 0) return { ok: false, message: NOT_REP };
  const col = { rep: 0, tran: columnOf(detail[head], 'TRAN_ID'), date: columnOf(detail[head], 'วันเข้ารักษา'), seq: columnOf(detail[head], 'SEQ NO') };
  const visits = new Map<string, { repNo: string; vn: string; date: string }>();
  for (const row of detail.slice(head + 1)) {
    const tran = cell(row, col.tran);
    const repNo = cell(row, col.rep);
    if (!/^\d+$/.test(tran) || !/^\d+$/.test(repNo)) continue;
    visits.set(tran, { repNo, vn: clean(cell(row, col.seq)), date: day(cell(row, col.date)) });
  }
  const top = findRow(items, (row) => columnOf(row, 'TRAN_ID') >= 0 && columnOf(row, 'เรียกเก็บ') >= 0);
  if (top < 0) return { ok: false, message: NOT_REP };
  const tranAt = columnOf(items[top], 'TRAN_ID');
  const claimAt = columnOf(items[top], 'เรียกเก็บ');
  const paidAt = columnOf(items[top], 'จ่ายชดเชย');
  const denyAt = columnOf(items[top], 'ปฏิเสธ');
  const errorAt = columnOf(items[top], 'Error Code');
  const itemAt = columnOf(items[top], 'ลำดับที่', tranAt + 1);
  const lines: OfcRepLine[] = [];
  let skipped = 0;
  for (const row of items.slice(top + 1)) {
    const tran = cell(row, tranAt);
    if (!/^\d+$/.test(tran)) continue;
    const visit = visits.get(tran);
    if (!visit) { skipped++; continue; }
    lines.push({
      repNo: visit.repNo, tranId: tran, itemNo: Number(cell(row, itemAt)) || 1, vn: visit.vn, date: visit.date,
      adp: cell(row, claimAt), itemName: cell(row, claimAt + 1), qty: fdhNum(row?.[claimAt + 2] ?? null), claim: fdhNum(row?.[claimAt + 3] ?? null),
      paid: paidAt < 0 ? 0 : fdhNum(row?.[paidAt + 1] ?? null), deny: clean(cell(row, denyAt)), error: clean(cell(row, errorAt))
    });
  }
  return { ok: true, lines, skipped };
}

/** Every row of every REP block in พึงรับ; the columns are found from each block's own header. */
export function parseOfcStm(sheets: FdhSheets): OfcParsed<OfcStmLine> {
  const table = sheetOf(sheets, STM_SHEET);
  if (!table) return { ok: false, message: NOT_STM };
  const docRow = findRow(table, (row) => /^เลขที่เอกสาร\s+\S+/.test(cell(row, 0)));
  if (docRow < 0) return { ok: false, message: NOT_STM };
  const docNo = cell(table[docRow], 0).replace(/^เลขที่เอกสาร\s+/, '').trim();
  const lines: OfcStmLine[] = [];
  let skipped = 0;
  let col: { date: number; claim: number; inst: number; total: number; seq: number } | null = null;
  for (let i = 0; i < table.length; i++) {
    const row = table[i];
    if (norm(cell(row, 0)) === 'REP' && columnOf(row, 'SEQ NO') >= 0) {
      col = { date: columnOf(row, 'วันเข้ารักษา'), claim: columnOf(row, 'เรียกเก็บ'), inst: columnOf(table[i + 1], 'ค่าอวัยวะฯ'), total: columnOf(row, 'พึงรับทั้งหมด'), seq: columnOf(row, 'SEQ NO') };
      i++;
      continue;
    }
    const repNo = cell(row, 0);
    if (!col || !/^\d+$/.test(repNo)) continue;
    const vn = clean(cell(row, col.seq));
    if (!vn) { skipped++; continue; }
    lines.push({ docNo, repNo, vn, date: day(cell(row, col.date)), claim: fdhNum(row?.[col.claim] ?? null), inst: col.inst < 0 ? 0 : fdhNum(row?.[col.inst] ?? null), total: fdhNum(row?.[col.total] ?? null) });
  }
  if (lines.length === 0 && skipped === 0) return { ok: false, message: NOT_STM };
  return { ok: true, docNo, lines, skipped };
}
