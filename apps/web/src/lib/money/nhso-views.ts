/**
 * เงินโอน สปสช.: the numbers behind each dashboard section, ported from the legacy `dashboard.js` (render* functions) without
 * the drawing. Every function is pure so the sections can be tested on their own.
 */
import { monthOf, type NhsoHospital, type NhsoRow, type NhsoTable } from './nhso-core';

export type NhsoDash = { keyOf: (row: NhsoRow) => string; metrics: string[]; dateCol: string | undefined; keyLabel: string };

const value = (row: NhsoRow, column: string) => Number(row[column]) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** "โรงพยาบาลวาริชภูมิ" → "รพ.วาริชภูมิ", without the leading รหัส. */
export const shortHospital = (name: string) => name.replace(/โรงพยาบาล/g, 'รพ.').replace(/^\d+\s+/, '');
/** Change in % from a to b, or null when a is 0. */
export const changePercent = (a: number, b: number) => (a ? ((b - a) / Math.abs(a)) * 100 : null);
/** The metric the legacy page picked first: เงินโอนเข้าบัญชี when present. */
export const defaultMetric = (metrics: readonly string[]) => metrics.find((column) => /โอนเข้าบัญชี/.test(column)) || metrics[0] || '';

/** ปีงบ found in the hospitals' transfer dates (from `fys`), sorted. */
export const datasetYears = (datasets: readonly NhsoHospital[]) => [...new Set(datasets.flatMap((dataset) => [...dataset.fys]))].sort((a, b) => a - b);

/**
 * Year chips: the first time the latest two are ticked; afterwards the person's choice stays, and a ปีงบ that was not there
 * before is ticked when it is the newest.
 */
export function defaultYears(years: readonly number[], previous: readonly number[] | null, known: readonly number[] | null): number[] {
  if (!known || !previous || previous.length === 0) return years.slice(-2);
  return years.filter((year) => previous.includes(year) || (!known.includes(year) && year === years[years.length - 1]));
}

/** ยอดตามกองทุน-รพ (report sheet): one row per fund and hospital, funds by their total of the last metric. */
export function fundHospitalSheet(datasets: readonly NhsoHospital[], allKeys: readonly string[], dash: NhsoDash): { funds: string[]; sheet: NhsoTable } {
  const last = dash.metrics[dash.metrics.length - 1]!;
  const totals = allKeys.map((key) => ({ key, total: datasets.reduce((sum, dataset) => sum + dataset.rows.filter((row) => dash.keyOf(row) === key).reduce((s, row) => s + value(row, last), 0), 0) }))
    .sort((a, b) => b.total - a.total);
  const rows: Record<string, unknown>[] = [];
  for (const { key } of totals) for (const dataset of datasets) {
    const matching = dataset.rows.filter((row) => dash.keyOf(row) === key);
    if (matching.length) rows.push({ [dash.keyLabel]: key, 'โรงพยาบาล': dataset.name, 'จำนวนรายการ': matching.length, ...Object.fromEntries(dash.metrics.map((column) => [column, round2(matching.reduce((s, row) => s + value(row, column), 0))])) });
  }
  return { funds: totals.map(({ key }) => key), sheet: { columns: [dash.keyLabel, 'โรงพยาบาล', 'จำนวนรายการ', ...dash.metrics], rows } };
}

/** ภาพรวม: the hero (วาริชภูมิ, or every hospital when it is not loaded) and the first 13 fund cards. */
export type NhsoOverview = {
  heroName: string; heroFound: boolean; heroTotal: number; heroByYear: Record<number, number>; heroFunds: number; heroRows: number;
  cards: { key: string; amount: number; share: number; change: number | null; hospitals: { name: string; byYear: Record<number, number>; total: number }[] }[];
};
export const MAX_FUND_CARDS = 13;
const HERO = /วาริชภูมิ/;

export function overview(datasets: readonly NhsoHospital[], dash: NhsoDash, metric: string, years: readonly number[]): NhsoOverview {
  const heroIndex = datasets.findIndex((dataset) => HERO.test(dataset.name));
  const funds = new Map<string, { total: number; byHospital: Record<number, Record<number, number>> }>();
  const heroByYear: Record<number, number> = Object.fromEntries(years.map((year) => [year, 0]));
  const heroFunds = new Set<string>();
  let heroRows = 0;
  datasets.forEach((dataset, hospital) => {
    for (const row of dataset.rows) {
      const fy = dash.dateCol ? monthOf(row[dash.dateCol])?.fy : undefined;
      if (fy === undefined || !years.includes(fy)) continue;
      const amount = value(row, metric);
      const key = dash.keyOf(row);
      let fund = funds.get(key);
      if (!fund) funds.set(key, (fund = { total: 0, byHospital: {} }));
      fund.total += amount;
      const perYear = (fund.byHospital[hospital] ??= {});
      perYear[fy] = (perYear[fy] || 0) + amount;
      if (heroIndex < 0 || hospital === heroIndex) { heroByYear[fy] = (heroByYear[fy] || 0) + amount; heroRows += 1; if (Math.abs(amount) > 0.005) heroFunds.add(key); }
    }
  });
  const heroTotal = years.reduce((sum, year) => sum + (heroByYear[year] || 0), 0);
  const heroYears = (fund: { byHospital: Record<number, Record<number, number>> }) => {
    if (heroIndex >= 0) return fund.byHospital[heroIndex] ?? {};
    const out: Record<number, number> = {};
    for (const perYear of Object.values(fund.byHospital)) for (const [year, amount] of Object.entries(perYear)) out[Number(year)] = (out[Number(year)] || 0) + amount;
    return out;
  };
  const sumYears = (perYear: Record<number, number>) => years.reduce((sum, year) => sum + (perYear[year] || 0), 0);
  const cards = [...funds].filter(([, fund]) => Math.abs(fund.total) > 0.005).sort((a, b) => b[1].total - a[1].total).slice(0, MAX_FUND_CARDS).map(([key, fund]) => {
    const own = heroYears(fund);
    const amount = sumYears(own);
    const hospitals = datasets.map((dataset, hospital) => ({ name: dataset.name, byYear: fund.byHospital[hospital] ?? {}, total: sumYears(fund.byHospital[hospital] ?? {}) }))
      .sort((a, b) => b.total - a.total);
    return { key, amount, share: heroTotal ? (amount / heroTotal) * 100 : 0, change: years.length > 1 ? changePercent(own[years[0]!] || 0, own[years[years.length - 1]!] || 0) : null, hospitals };
  });
  return { heroName: heroIndex >= 0 ? 'โรงพยาบาลวาริชภูมิ' : 'ทุกโรงพยาบาล', heroFound: heroIndex >= 0, heroTotal, heroByYear, heroFunds: heroFunds.size, heroRows, cards };
}

/** ยอดเงินตามกองทุน เทียบทุกโรงพยาบาล: per hospital, the row count and each metric, for one fund or all; plus the chart by ปีงบ. */
export function fundByHospital(datasets: readonly NhsoHospital[], dash: NhsoDash, fund: string | null, sortMetric: string) {
  const pick = (dataset: NhsoHospital) => (fund === null ? dataset.rows : dataset.rows.filter((row) => dash.keyOf(row) === fund));
  const table = datasets.map((dataset) => {
    const rows = pick(dataset);
    return { name: dataset.name, count: rows.length, sums: Object.fromEntries(dash.metrics.map((column) => [column, rows.reduce((s, row) => s + value(row, column), 0)])) as Record<string, number> };
  });
  const totals = Object.fromEntries(dash.metrics.map((column) => [column, table.reduce((s, row) => s + row.sums[column]!, 0)])) as Record<string, number>;
  const fyOf = (row: NhsoRow) => (dash.dateCol ? monthOf(row[dash.dateCol])?.fy : undefined);
  const years = [...new Set(datasets.flatMap((dataset) => pick(dataset).map(fyOf)).filter((fy): fy is number => Boolean(fy)))].sort((a, b) => a - b);
  const chart = datasets.map((dataset) => {
    const sums: Record<string, number> = {};
    for (const row of pick(dataset)) {
      const fy = years.length ? fyOf(row) : null;
      if (years.length && !fy) continue;
      for (const column of dash.metrics) sums[`${column}|${fy}`] = (sums[`${column}|${fy}`] || 0) + value(row, column);
    }
    return { name: dataset.name, sums };
  });
  const sortKey = `${sortMetric}|${years.length ? years[years.length - 1] : null}`;
  chart.sort((a, b) => (b.sums[sortKey] || 0) - (a.sums[sortKey] || 0));
  return { table, totals, years, chart };
}

/** รายรับแยกรายกองทุน: per hospital, each chosen fund and ปีงบ, sorted by the latest year's total. */
export function multiFund(datasets: readonly NhsoHospital[], dash: NhsoDash, metric: string, funds: readonly string[], years: readonly (number | null)[]) {
  const latest = years[years.length - 1];
  const rows = datasets.map((dataset) => {
    const cells: Record<string, number> = {};
    for (const year of years) { cells[`T|${year}`] = 0; for (const fund of funds) cells[`${fund}|${year}`] = 0; }
    for (const row of dataset.rows) {
      const key = dash.keyOf(row);
      if (!funds.includes(key)) continue;
      const fy = dash.dateCol && years[0] !== null ? monthOf(row[dash.dateCol])?.fy ?? undefined : null;
      if (fy === undefined || !years.includes(fy)) continue;
      const amount = value(row, metric);
      cells[`${key}|${fy}`]! += amount;
      cells[`T|${fy}`]! += amount;
    }
    return { name: dataset.name, cells };
  }).sort((a, b) => (b.cells[`T|${latest}`] || 0) - (a.cells[`T|${latest}`] || 0));
  return rows;
}

/** Funds by their total of the last metric over every hospital: the order of the รายรับแยกรายกองทุน chips. */
export function fundsByTotal(datasets: readonly NhsoHospital[], dash: NhsoDash): string[] {
  const last = dash.metrics[dash.metrics.length - 1]!;
  const totals = new Map<string, number>();
  for (const dataset of datasets) for (const row of dataset.rows) { const key = dash.keyOf(row); totals.set(key, (totals.get(key) || 0) + value(row, last)); }
  return [...totals].sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

/** เทียบรายกองทุน ตามปีงบประมาณ: funds × chosen ปีงบ for one hospital or all, and the เทียบปีงบ report sheet. */
export function yearCompare(datasets: readonly NhsoHospital[], dash: NhsoDash, metric: string, hospital: number | null, years: readonly number[]) {
  const sets = hospital === null ? datasets : [datasets[hospital]!];
  const sums = new Map<string, Record<number, number>>();
  for (const dataset of sets) for (const row of dataset.rows) {
    const fy = dash.dateCol ? monthOf(row[dash.dateCol])?.fy : undefined;
    if (fy === undefined || !years.includes(fy)) continue;
    const key = dash.keyOf(row);
    const entry = sums.get(key) ?? Object.fromEntries(years.map((year) => [year, 0]));
    entry[fy] = (entry[fy] || 0) + value(row, metric);
    sums.set(key, entry);
  }
  const total = (entry: Record<number, number>) => years.reduce((s, year) => s + entry[year]!, 0);
  const rows = [...sums].map(([key, byYear]) => ({ key, byYear })).filter((row) => years.some((year) => row.byYear[year])).sort((a, b) => total(b.byYear) - total(a.byYear));
  const totals = Object.fromEntries(years.map((year) => [year, rows.reduce((s, row) => s + row.byYear[year]!, 0)])) as Record<number, number>;
  const first = years[0]!;
  const last = years[years.length - 1]!;
  const sheet: NhsoTable = {
    columns: [dash.keyLabel, ...years.map((year) => `ปีงบ ${year}`), ...(years.length > 1 ? ['ผลต่าง', 'เปลี่ยนแปลง (%)'] : [])],
    rows: rows.map((row) => {
      const change = changePercent(row.byYear[first]!, row.byYear[last]!);
      return { [dash.keyLabel]: row.key, ...Object.fromEntries(years.map((year) => [`ปีงบ ${year}`, round2(row.byYear[year]!)])),
        ...(years.length > 1 ? { 'ผลต่าง': round2(row.byYear[last]! - row.byYear[first]!), 'เปลี่ยนแปลง (%)': change == null ? '' : Math.round(change * 10) / 10 } : {}) };
    })
  };
  return { rows, totals, sheet };
}

/** A report cell as the legacy table showed it: money with 2 decimals for fractions and amounts from 1,000. */
export function reportCell(raw: unknown): string {
  if (typeof raw === 'number' && (!Number.isInteger(raw) || Math.abs(raw) >= 1000)) return raw.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (raw == null) return '';
  // NHSO dates come as dd/mm/yyyy พ.ศ.; the system shows every date as "16 พ.ย. 2569".
  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s.*)?$/.exec(String(raw));
  if (date && Number(date[2]) >= 1 && Number(date[2]) <= 12) return `${Number(date[1])} ${TH_MONTHS[Number(date[2]) - 1]} ${date[3]}${date[4] ?? ''}`;
  return String(raw);
}
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export const MAX_SHOW = 2000;
/** Search over every column of a report sheet, first 2,000 rows shown. */
export function searchReport(table: NhsoTable, query: string) {
  const q = query.trim().toLowerCase();
  const matched = q ? table.rows.filter((row) => table.columns.some((column) => String(row[column] ?? '').toLowerCase().includes(q))) : table.rows;
  return { rows: matched.slice(0, MAX_SHOW), total: matched.length };
}
