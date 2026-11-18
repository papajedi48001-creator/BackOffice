/**
 * เงินโอน สปสช.: the dashboard calculations, ported line by line from the legacy `nhso-core.js` (itself from the Apps Script
 * Index.html), with the same formulas. No DOM, no server code: client components use it directly.
 */
export type NhsoValue = string | number | boolean | null;
export type NhsoRow = Record<string, NhsoValue>;
/** One stored report as the dashboard receives it. */
export type NhsoStored = { hcode: string; fy: number; fileName?: string; rows: readonly (readonly NhsoValue[] | null)[] };
/** One hospital: its reports of every ปีงบ merged. */
export type NhsoHospital = { name: string; file: string; files: string[]; columns: string[]; rows: NhsoRow[]; fys: Set<number>; allocated: boolean; badGroups: number; groups?: number };
export type NhsoSettings = { keys: string[]; cmp: string[]; pivotCol: string; common: string[]; numeric: string[]; tol: number; ignoreCase: boolean; aggregate: boolean };
export type NhsoSettingsInput = { keys?: string[]; cmp?: string[]; pivotCol?: string; tol?: number | string; ignoreCase?: boolean; aggregate?: boolean };
export type NhsoTable = { columns: string[]; rows: Record<string, unknown>[] };
export type NhsoCompare = { report: Record<string, NhsoTable | null>; stats: [number, string][]; keyOf: (row: NhsoRow) => string; allKeys: string[]; keys: string[]; cmp: string[]; keyLabel: string };

export const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** ปีงบประมาณไทย: ต.ค.–ก.ย. (ต.ค. 2568 = ปีงบ 2569). */
export function monthOf(value: unknown): { sort: string; label: string; fy: number } | null {
  let y: number | undefined;
  let m: number | undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) { y = value.getFullYear(); m = value.getMonth(); }
  else if (typeof value === 'string') {
    let t = value.trim().match(/(\d{1,2})\s*([ก-๙.]+)\s*(\d{4})/);
    if (t) { m = TH_M.indexOf(t[2]!.replace(/\s/g, '')); y = Number(t[3]); }
    else if ((t = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { m = Number(t[2]) - 1; y = Number(t[3]); }
  }
  if (y == null || m == null || m < 0) return null;
  if (y < 2400) y += 543;
  return { sort: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${TH_M[m]} ${String(y).slice(2)}`, fy: m >= 9 ? y + 1 : y };
}

const asNumber = (value: unknown) => Number(value) || 0;

/**
 * รายงาน สปสช. puts the whole transfer (one ลำดับ) in เงินโอนเข้าบัญชี of its first row; its คงเหลือ add up to that transfer, so the
 * transfer is split over the rows by คงเหลือ. A group whose sums differ is left alone and counted.
 */
export function allocateTransfer(head: readonly string[], rows: NhsoRow[]): { allocated: boolean; badGroups: number; groups?: number } {
  const T = 'เงินโอนเข้าบัญชี';
  const R = 'คงเหลือ';
  if (!head.includes(T) || !head.includes(R)) return { allocated: false, badGroups: 0 };
  const groupKey = head.includes('ลำดับ') ? (row: NhsoRow) => row['ลำดับ'] : (row: NhsoRow) => `${row['วันที่โอน'] ?? ''}|${row['Batch No.'] ?? ''}`;
  const groups: NhsoRow[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && groupKey(last[0]!) === groupKey(row) && groupKey(row) != null) last.push(row); else groups.push([row]);
  }
  let bad = 0;
  for (const group of groups) {
    const sum = (column: string) => group.reduce((total, row) => total + asNumber(row[column]), 0);
    if (Math.abs(sum(R) - sum(T)) > 0.01) { bad += 1; continue; }
    for (const row of group) row[T] = asNumber(row[R]);
  }
  return { allocated: true, badGroups: bad, groups: groups.length };
}

const filledCount = (row: readonly NhsoValue[] | null | undefined) => (row ?? []).filter((value) => value != null && String(value).trim() !== '').length;

/** Stored reports → one dataset per hospital with every ปีงบ merged, as the legacy page did. `headerRow` 0 finds it. */
export function buildDatasets(stored: readonly NhsoStored[], options: { headerRow?: number | string } = {}): NhsoHospital[] {
  const fixedHeader = Number(options.headerRow) || 0;
  const byName = new Map<string, NhsoHospital>();
  for (const report of stored) {
    const aoa = report.rows ?? [];
    const fileName = `${report.fy}/${report.fileName || report.hcode}`;
    const header = fixedHeader || (aoa.findIndex((row) => filledCount(row) >= 3) + 1) || 1;
    const head = (aoa[header - 1] ?? []).map((cell, index) => (cell == null || String(cell).trim() === '' ? `คอลัมน์${index + 1}` : String(cell).trim()));
    const rows = aoa.slice(header)
      .filter((row) => filledCount(row) && !/^(รวม|ยอดรวม|total)/i.test(String((row ?? [])[0] ?? '').trim()))
      .map((row) => Object.fromEntries(head.map((column, index) => [column, row![index] ?? null])) as NhsoRow);
    const meta = aoa.slice(0, header - 1).map((row) => (row ?? []).filter((value) => value != null).join(' ').trim());
    const unit = meta.find((line) => /หน่วยบริการ|โรงพยาบาล|รพ\./.test(line));
    let name = unit ? unit.replace(/^หน่วยบริการ\s*/, '').trim() : fileName.replace(/\.[^.]+$/, '');
    const allocation = allocateTransfer(head, rows);
    const dateColumn = head.find((column) => /วันที่/.test(column));
    const fys = new Set<number>(dateColumn ? rows.map((row) => monthOf(row[dateColumn])?.fy).filter((fy): fy is number => Boolean(fy)) : []);
    // The same hospital in another ปีงบ joins it; the same ปีงบ again is a second copy, shown with " *".
    let merged = false;
    while (byName.has(name)) {
      const dataset = byName.get(name)!;
      if (fys.size && dataset.fys.size && ![...fys].some((fy) => dataset.fys.has(fy)) && dataset.columns.join() === head.join()) {
        dataset.rows.push(...rows); fys.forEach((fy) => dataset.fys.add(fy)); dataset.files.push(fileName); dataset.badGroups += allocation.badGroups;
        merged = true; break;
      }
      name += ' *';
    }
    if (!merged) byName.set(name, { name, file: fileName, files: [fileName], columns: head, rows, fys, ...allocation });
  }
  return [...byName.values()];
}

export function norm(value: unknown, ignoreCase?: boolean): string | number | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (s === '') return null;
  const n = s.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(n)) return parseFloat(n);
  return ignoreCase ? s.toLowerCase() : s;
}
export const eq = (a: unknown, b: unknown, tol: number) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= tol + 1e-9 : a === b);
export const show = (value: unknown) => (value == null ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : value);

export const commonColumns = (datasets: readonly NhsoHospital[]) => (datasets.length ? datasets[0]!.columns.filter((column) => datasets.every((dataset) => dataset.columns.includes(column))) : []);
const isNumericColumn = (datasets: readonly NhsoHospital[], column: string) => datasets[0]!.rows.slice(0, 200).some((row) => typeof row[column] === 'number') && !/^ลำดับ|^no\.?$/i.test(column);

/** The compare settings' defaults, keeping what the person chose while those columns still exist. */
export function defaultSettings(datasets: readonly NhsoHospital[], previous: NhsoSettingsInput = {}): NhsoSettings {
  const common = commonColumns(datasets);
  const keep = (list: string[] | undefined) => (list ?? []).filter((column) => common.includes(column));
  const previousKeys = keep(previous.keys);
  const previousCompare = keep(previous.cmp);
  const keys = previousKeys.length ? previousKeys
    : [(common.includes('กองทุน') ? 'กองทุน' : common.find((column) => /กองทุน|งวด|เลขที่|อ้างอิง|ref|id|transaction/i.test(column))) || common[0]].filter((column): column is string => Boolean(column));
  const numeric = common.filter((column) => isNumericColumn(datasets, column));
  const cmp = previousCompare.length ? previousCompare : numeric.filter((column) => !keys.includes(column));
  const pivotCol = previous.pivotCol && numeric.includes(previous.pivotCol) ? previous.pivotCol
    : (numeric.find((column) => column === 'คงเหลือ') || numeric.find((column) => /โอนเข้าบัญชี/.test(column)) || numeric.find((column) => /จำนวนเงิน|amount/i.test(column)) || numeric[0] || '');
  return {
    keys, cmp, pivotCol, common, numeric,
    tol: previous.tol != null ? Number(previous.tol) || 0 : 0,
    ignoreCase: previous.ignoreCase != null ? Boolean(previous.ignoreCase) : true,
    aggregate: previous.aggregate != null ? Boolean(previous.aggregate) : true
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** เริ่มเทียบข้อมูล: compares the hospitals by key and builds every report tab and the stats. */
export function runCompare(datasets: readonly NhsoHospital[], settings: Pick<NhsoSettings, 'keys' | 'cmp' | 'pivotCol' | 'tol' | 'ignoreCase' | 'aggregate'>): NhsoCompare {
  const keys = settings.keys;
  const cmp = settings.cmp.filter((column) => !keys.includes(column));
  const tol = Number(settings.tol) || 0;
  const ic = Boolean(settings.ignoreCase);
  const agg = Boolean(settings.aggregate);
  const pc = settings.pivotCol;
  const names = datasets.map((dataset) => dataset.name);
  const keyOf = (row: NhsoRow) => keys.map((column) => { const value = norm(row[column], ic); return value == null ? '' : String(value); }).join(' | ');

  const index: Record<string, Map<string, NhsoRow>> = {};
  const dups: Record<string, unknown>[] = [];
  for (const dataset of datasets) {
    const map = new Map<string, NhsoRow>();
    const count = new Map<string, number>();
    for (const row of dataset.rows) {
      const key = keyOf(row);
      count.set(key, (count.get(key) || 0) + 1);
      if (!map.has(key)) map.set(key, { ...row });
      else if (agg) {
        // Numbers add up; different text is joined with " / ".
        const target = map.get(key)!;
        for (const column of dataset.columns) {
          const a = target[column];
          const b = row[column];
          if (typeof a === 'number' && typeof b === 'number') target[column] = round2(a + b);
          else if (b != null && String(b).trim() !== '' && !String(a ?? '').split(' / ').includes(String(b))) target[column] = a == null ? b : `${a} / ${b}`;
        }
      }
    }
    for (const [key, times] of count) if (times > 1) dups.push({ 'ไฟล์': dataset.name, key, 'จำนวนครั้ง': times });
    index[dataset.name] = map;
  }
  const allKeys = [...new Set(names.flatMap((name) => [...index[name]!.keys()]))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  const presence: Record<string, unknown>[] = [];
  const missing: Record<string, unknown>[] = [];
  const diffs: (Record<string, unknown> & { _odd: string[] })[] = [];
  const pivot: Record<string, unknown>[] = [];
  for (const key of allKeys) {
    const present = names.filter((name) => index[name]!.has(key));
    const absent = names.filter((name) => !index[name]!.has(key));
    if (pc) {
      const values = names.map((name) => (index[name]!.has(key) ? (typeof index[name]!.get(key)![pc] === 'number' ? index[name]!.get(key)![pc] : norm(index[name]!.get(key)![pc])) : null));
      pivot.push({ key, 'รวมทุกไฟล์': round2(values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0)), ...Object.fromEntries(names.map((name, i) => [name, values[i] ?? '✗'])) });
    }
    presence.push({ key, 'มีในกี่ไฟล์': present.length, ...Object.fromEntries(names.map((name) => [name, index[name]!.has(key) ? '✓' : '✗'])) });
    if (absent.length) missing.push({ key, 'มีใน (ไฟล์)': present.length, 'ขาดใน (ไฟล์)': absent.length, 'ไฟล์ที่ขาด': absent.join(', ') });
    for (const column of cmp) {
      const values = present.map((name) => [name, norm(index[name]!.get(key)![column], ic)] as const);
      if (values.every(([, value]) => eq(value, values[0]![1], tol))) continue;
      const groups: { v: unknown; n: string[] }[] = [];
      for (const [name, value] of values) { const group = groups.find((g) => eq(g.v, value, tol)); if (group) group.n.push(name); else groups.push({ v: value, n: [name] }); }
      const major = groups.reduce((a, b) => (b.n.length > a.n.length ? b : a));
      const odd = values.map(([name]) => name).filter((name) => !major.n.includes(name));
      diffs.push({ key, 'คอลัมน์': column, 'ค่าส่วนใหญ่': show(major.v), 'ไฟล์ที่ค่าต่าง': odd.join(', '),
        ...Object.fromEntries(names.map((name) => [name, index[name]!.has(key) ? show(index[name]!.get(key)![column]) : '—'])), _odd: odd });
    }
  }
  const summary = datasets.map((dataset) => ({
    'ไฟล์': dataset.name, 'จำนวนแถว': dataset.rows.length, 'key ไม่ซ้ำ': index[dataset.name]!.size,
    'key ที่ไฟล์นี้ขาด': missing.filter((row) => String(row['ไฟล์ที่ขาด']).split(', ').includes(dataset.name)).length,
    'จุดที่ค่าต่างจากส่วนใหญ่': diffs.filter((row) => row._odd.includes(dataset.name)).length,
    [`ยอดรวม ${pc}`]: round2(dataset.rows.reduce((total, row) => total + (typeof row[pc] === 'number' ? row[pc] as number : 0), 0))
  }));

  if (pc && pivot.length) {
    const columnTotal = (name: string) => round2(pivot.reduce<number>((total, row) => total + (typeof row[name] === 'number' ? row[name] as number : 0), 0));
    pivot.push({ key: 'รวม', 'รวมทุกไฟล์': columnTotal('รวมทุกไฟล์'), ...Object.fromEntries(names.map((name) => [name, columnTotal(name)])) });
  }
  const keyLabel = keys.join(' + ');
  const report: Record<string, NhsoTable | null> = {
    'สรุป': { columns: Object.keys(summary[0] || {}), rows: summary },
    ...(pc ? { [`เทียบยอด ${pc}`.slice(0, 31)]: { columns: [keyLabel, 'รวมทุกไฟล์', ...names], rows: pivot.map((row) => ({ ...row, [keyLabel]: row.key })) } } : {}),
    'แถวที่ขาด': { columns: ['key', 'มีใน (ไฟล์)', 'ขาดใน (ไฟล์)', 'ไฟล์ที่ขาด'], rows: missing },
    'ตารางมี-ไม่มี': { columns: ['key', 'มีในกี่ไฟล์', ...names], rows: presence },
    'ค่าไม่ตรงกัน': { columns: ['key', 'คอลัมน์', 'ค่าส่วนใหญ่', 'ไฟล์ที่ค่าต่าง', ...names], rows: diffs },
    'ยอดตามกองทุน-รพ': null,
    ...(agg ? {} : { 'key ซ้ำ': { columns: ['ไฟล์', 'key', 'จำนวนครั้ง'], rows: dups } })
  };
  const stats: [number, string][] = [
    [datasets.length, 'โรงพยาบาล'], [allKeys.length, `${keyLabel}ทั้งหมด`],
    [allKeys.length - missing.length, `${keyLabel}ที่มีครบทุก รพ.`], [missing.length, `${keyLabel}ที่บาง รพ. ไม่มี`],
    [diffs.length, 'ยอดที่ต่างจาก รพ. ส่วนใหญ่'], agg ? [datasets.reduce((total, dataset) => total + dataset.rows.length, 0), 'รายการโอนเงินทั้งหมด'] : [dups.length, `${keyLabel}ที่ซ้ำในไฟล์`]
  ];
  return { report, stats, keyOf, allKeys, keys, cmp, keyLabel };
}

/** The money columns the dashboard shows. */
export function dashboardMetrics(datasets: readonly NhsoHospital[], cmp: readonly string[]): { metrics: string[]; dateCol: string | undefined } {
  const common = commonColumns(datasets);
  const isNumber = (column: string) => datasets.some((dataset) => dataset.rows.slice(0, 200).some((row) => typeof row[column] === 'number'));
  let metrics = ['คงเหลือ', 'จำนวนเงินรอหักกลบ', 'เงินโอนเข้าบัญชี'].filter((column) => common.includes(column));
  if (!metrics.length) metrics = cmp.filter(isNumber).slice(0, 4);
  return { metrics, dateCol: common.find((column) => /วันที่|date/i.test(column)) };
}

/** One column of a hospital added up by ปีงบ: `{ fy: sum }`. */
export function sumByFy(dataset: NhsoHospital, column: string, dateColumn: string | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const row of dataset.rows) {
    const fy = monthOf(dateColumn ? row[dateColumn] : undefined)?.fy;
    if (!fy) continue;
    out[fy] = (out[fy] || 0) + asNumber(row[column]);
  }
  return out;
}
