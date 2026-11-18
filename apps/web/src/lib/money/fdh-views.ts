/**
 * ติดตามกองทุนย่อย FDH dashboard helpers with no DOM: the status line, the filters (legacy `dashboard.js` `setupFilters`,
 * `filterArgs`, `renderActive`), search and the Excel sheets with the legacy sheet and column names.
 */
import { bangkokToday, formatBangkokDateOnly, formatBangkokTime } from '../bangkok-time';
import { bySubFund, STATUS, type CaseFilter, type FdhCase, type FdhStatus, type FundVisitGroup, type FundVisitRow, type PersonFundGroup } from './fdh-core';

export type FdhFilters = { from: string; to: string; period: string; right: string; subFund: string; status: FdhStatus | ''; errorCode: string; fixedC: boolean; q: string };
export type DateBounds = { from: string; to: string };
type Stored = { period?: string; uploaded_at?: string };

const int = (n: number) => n.toLocaleString('th-TH');
export const fdhDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? formatBangkokDateOnly(iso.slice(0, 10)) : '-');

/** "ข้อมูล REP 2 ไฟล์ · STM 1 ไฟล์ (งวด …) · อัปโหลดล่าสุด 18 พ.ย. 2569 11:30" (upload time in Bangkok). */
export function fdhStatusLine(data: { reps: readonly Stored[]; stms: readonly Stored[] }): string {
  const periods = [...new Set(data.stms.map((stm) => stm.period).filter(Boolean))].sort();
  const last = [...data.reps, ...data.stms].map((doc) => doc.uploaded_at || '').sort().pop() || '';
  return `ข้อมูล REP ${int(data.reps.length)} ไฟล์ · STM ${int(data.stms.length)} ไฟล์`
    + (periods.length ? ` (งวด ${periods.join(', ')})` : '')
    + (last ? ` · อัปโหลดล่าสุด ${formatBangkokDateOnly(bangkokToday(new Date(last)))} ${formatBangkokTime(last)}` : '');
}

export function dateBounds(cases: readonly FdhCase[]): DateBounds {
  const dates = cases.map((c) => c.visitDate).filter(Boolean).sort();
  return { from: dates[0] || '', to: dates[dates.length - 1] || '' };
}

export const initialFilters = (bounds: DateBounds): FdhFilters => ({ from: bounds.from, to: bounds.to, period: '', right: '', subFund: '', status: '', errorCode: '', fixedC: false, q: '' });

/** A date bound still at the data's edge is not filtered, so visits without a date stay in (legacy). */
export function filterArgs(f: FdhFilters, bounds: DateBounds, skipStatus: boolean): CaseFilter {
  return {
    from: f.from !== bounds.from ? f.from : '', to: f.to !== bounds.to ? f.to : '', periods: f.period ? [f.period] : [], rights: f.right ? [f.right] : [],
    subFund: f.subFund, status: skipStatus ? '' : f.status, errorCode: f.errorCode, fixedC: skipStatus ? false : f.fixedC, q: f.q
  };
}

/** The select choices with counts: งวด newest first; สิทธิ and กองทุนย่อย by count (ties in first-seen order, as the legacy sort). */
export function filterOptions(cases: readonly FdhCase[]) {
  const count = (key: (c: FdhCase) => readonly string[]) => {
    const seen = new Map<string, number>();
    for (const c of cases) for (const value of key(c)) seen.set(value, (seen.get(value) || 0) + 1);
    return [...seen];
  };
  return {
    periods: count((c) => c.periods).sort((a, b) => (a[0] < b[0] ? 1 : -1)),
    rights: count((c) => [c.right]).sort((a, b) => b[1] - a[1]),
    subs: count((c) => c.subFunds).sort((a, b) => b[1] - a[1])
  };
}

export function activeFilterTags(f: FdhFilters, bounds: DateBounds): string[] {
  const parts: string[] = [];
  if (f.from !== bounds.from || f.to !== bounds.to) parts.push(`${fdhDate(f.from)} – ${fdhDate(f.to)}`);
  if (f.period) parts.push('งวด ' + f.period);
  if (f.right) parts.push('สิทธิ ' + f.right);
  if (f.subFund) parts.push(f.subFund);
  if (f.status) parts.push(STATUS[f.status].label);
  if (f.errorCode) parts.push('Error ' + f.errorCode);
  if (f.fixedC) parts.push('แก้ไขแล้ว ผ่านแล้ว');
  if (f.q) parts.push(`ค้นหา "${f.q}"`);
  return parts;
}

const has = (values: readonly unknown[], q: string) => { const text = q.toLowerCase(); return !text || values.some((value) => String(value || '').toLowerCase().includes(text)); };
export const personMatches = (p: PersonFundGroup, q: string) => has([p.hn, p.name, p.pid], q);
export const fundRowMatches = (row: FundVisitRow, q: string) => has([row.case.hn, row.case.name, row.case.pid, row.case.seq], q);

type SheetRow = Record<string, string | number>;
export type FdhExportSheets = Record<'รายเคส' | 'รายกองทุนย่อย' | 'รายบุคคลแยกกองทุน' | 'รายกองทุน-HN-VN' | 'แยกกองทุนต่อ VN', SheetRow[]>;

/** ดาวน์โหลด Excel: the filtered cases, sub-funds of the cases before status/search, the people list as searched, every fund's VNs and the splits. */
export function fdhExportSheets({ view, base, people, funds }: { view: readonly FdhCase[]; base: readonly FdhCase[]; people: readonly PersonFundGroup[]; funds: readonly FundVisitGroup[] }): FdhExportSheets {
  const label = (c: FdhCase) => STATUS[c.status].label;
  const fundRows: SheetRow[] = [];
  for (const g of funds) for (const r of g.rows) fundRows.push({ 'กองทุนย่อย (REP)': g.subFund, 'HN': r.case.hn, 'ชื่อ - สกุล': r.case.name,
    'VN': r.case.seq, 'วันรับบริการ': r.case.visitDate, 'สถานะ': label(r.case), 'กองทุนย่อยใน VN': r.case.subFunds.join(','),
    'ชดเชยตาม REP (ทั้ง VN)': r.case.repNet, 'ได้รับ STM กองทุนนี้': r.case.fundSplit ? r.own : '', 'ยอดรวมกับกองทุนอื่น': r.shared || '',
    'งวด STM': r.case.periods.join(',') });
  const splits: SheetRow[] = [];
  for (const c of view) if (c.fundSplit) for (const sp of c.fundSplit.parts) splits.push({ 'VN': c.seq, 'วันรับบริการ': c.visitDate, 'HN': c.hn, 'ชื่อ - สกุล': c.name,
    'กองทุนย่อย (REP)': sp.funds.join(','), 'แยกได้': sp.exact ? 'ใช่' : 'ยอดรวมกัน', 'คอลัมน์ STM': sp.cols.join(','), 'ได้รับ': sp.amount });
  return {
    'รายเคส': view.map((c) => ({
      'สถานะ': label(c), 'วันรับบริการ': c.visitDate, 'VN': c.seq, 'เคยติด C แก้แล้ว': c.fixedC ? 'ใช่' : '', 'TRAN_ID': c.tranId, 'HN': c.hn, 'PID': c.pid, 'ชื่อ - สกุล': c.name,
      'สิทธิหลัก': c.right, 'กองทุนย่อย': c.subFunds.join(','), 'เรียกเก็บ': c.charge, 'ชดเชยตาม REP': c.repNet,
      'ได้รับตาม STM': c.stmTotal, 'ส่วนต่าง': c.diff, 'Error Code': c.errorCode, 'REP No.': c.current ? String(c.current.rep_no ?? '') : '',
      'ส่ง REP (ครั้ง)': (c.current ? 1 : 0) + c.history.length, 'งวด STM': c.periods.join(',')
    })),
    'รายกองทุนย่อย': bySubFund(base).map((r) => ({
      'กองทุนย่อย': r.subFund, 'เคส': r.cases, 'เรียกเก็บ': r.charge, 'ชดเชยตาม REP': r.repNet, 'ได้รับตาม STM': r.stmTotal,
      'รอ STM': r.pendingNet, 'ติด C (เคส)': r.errorCases, '% ได้รับ': Math.round(r.paidPct * 10) / 10
    })),
    'รายบุคคลแยกกองทุน': people.map((p) => ({ 'HN': p.hn, 'PID': p.pid, 'ชื่อ - สกุล': p.name, 'สิทธิล่าสุด': p.right, 'กองทุนย่อย (REP)': p.subFund,
      'จำนวนครั้ง': p.visits, 'visit ที่เบิกร่วมกองทุนอื่น': p.shared, 'เรียกเก็บ': p.charge, 'ชดเชยตาม REP': p.repNet,
      'ได้รับ STM กองทุนนี้': p.stmFund, 'ยอดรวมกับกองทุนอื่น': p.stmShared, 'รอ STM (ครั้ง)': p.pending,
      'VN': p.cases.map((c) => c.seq).join(',') })),
    'รายกองทุน-HN-VN': fundRows,
    'แยกกองทุนต่อ VN': splits
  };
}

export function fdhExportFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `fdh-monitor-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}.xlsx`;
}
