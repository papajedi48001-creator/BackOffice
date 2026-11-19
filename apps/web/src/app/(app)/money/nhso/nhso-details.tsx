'use client';

import { useId, useState } from 'react';
import { GroupedBarChart, type ChartSeries } from '../../../../components/grouped-bar-chart';
import type { NhsoHospital, NhsoTable } from '../../../../lib/money/nhso-core';
import { changePercent, datasetYears, defaultMetric, fundByHospital, fundsByTotal, multiFund, reportCell, searchReport, shortHospital, MAX_SHOW, yearCompare, type NhsoDash } from '../../../../lib/money/nhso-views';
import { formatMoney } from '../dental/dental-format';
import { Chips, percentText, useYearChips, yearLabel, yearSeries } from './nhso-shared';

const ALL = '__all';
const fundName = (key: string) => key || '(ว่าง)';
const sign = (value: number) => (value > 0 ? 'is-up' : value < 0 ? 'is-down' : '');

function MetricSelect({ label, metrics, value, onChange }: { label: string; metrics: readonly string[]; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <span className="nhso-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)}>{metrics.map((column) => <option key={column}>{column}</option>)}</select></span>;
}

/** ยอดเงินตามกองทุน เทียบทุกโรงพยาบาล: one fund (or all), a table per hospital and bars by metric and ปีงบ. */
function FundSection({ datasets, dash, funds }: { datasets: readonly NhsoHospital[]; dash: NhsoDash; funds: readonly string[] }) {
  const id = useId();
  const [fund, setFund] = useState(ALL);
  const [chosen, setMetric] = useState('');
  const metric = dash.metrics.includes(chosen) ? chosen : defaultMetric(dash.metrics);
  const picked = fund !== ALL && funds.includes(fund) ? fund : null;
  const view = fundByHospital(datasets, dash, picked, metric);
  const groups = view.years.length ? view.years : [null];
  const series: ChartSeries[] = dash.metrics.flatMap((column, index) => groups.map((year, at) => ({ name: year ? `${column} ปีงบ ${year}` : column, tone: index % 4, faded: groups.length > 1 && at < groups.length - 1 })));
  return <section className="money-card" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>ยอดเงินตามกองทุน เทียบทุกโรงพยาบาล</h3>
    <div className="nhso-toolbar">
      <span className="nhso-field"><label htmlFor={`${id}-fund`}>กองทุน</label>
        <select id={`${id}-fund`} value={picked ?? ALL} onChange={(event) => setFund(event.target.value)}><option value={ALL}>{`ทุก${dash.keyLabel}รวมกัน`}</option>{funds.map((key) => <option key={key} value={key}>{fundName(key)}</option>)}</select></span>
      <MetricSelect label="เรียงโรงพยาบาลตาม" metrics={dash.metrics} value={metric} onChange={setMetric} />
    </div>
    <div className="money-table-wrap is-matrix"><table aria-label="ยอดเงินตามกองทุน เทียบทุกโรงพยาบาล">
      <thead><tr><th>โรงพยาบาล</th><th className="money-number">จำนวนรายการ</th>{dash.metrics.map((column) => <th key={column} className="money-number">{column}</th>)}</tr></thead>
      <tbody>{view.table.map((row) => <tr key={row.name}><td>{row.name}</td><td className="money-number">{row.count ? row.count : <span className="nhso-missing">ไม่มี</span>}</td>{dash.metrics.map((column) => <td key={column} className="money-number">{formatMoney(row.sums[column]!)}</td>)}</tr>)}</tbody>
      <tfoot><tr><th>รวม {view.table.length} โรงพยาบาล</th><th className="money-number">{view.table.reduce((sum, row) => sum + row.count, 0)}</th>{dash.metrics.map((column) => <th key={column} className="money-number">{formatMoney(view.totals[column]!)}</th>)}</tr></tfoot>
    </table></div>
    <h4 className="nhso-chart-title">เทียบยอดระหว่างโรงพยาบาล แยกปีงบประมาณ (ปีก่อนสีอ่อน ปีล่าสุดสีเข้ม)</h4>
    <GroupedBarChart ariaLabel="เทียบยอดระหว่างโรงพยาบาล แยกปีงบประมาณ" series={series} valueFormat={formatMoney}
      groups={view.chart.map((row) => ({ label: shortHospital(row.name), title: row.name, values: dash.metrics.flatMap((column) => groups.map((year) => row.sums[`${column}|${year}`] || 0)) }))} />
    {datasets.some((dataset) => dataset.allocated) && <p className="money-note">หมายเหตุ: ไฟล์ สปสช. ลง &quot;เงินโอนเข้าบัญชี&quot; เป็นยอดรวมไว้ที่แถวแรกของแต่ละรายการโอน ระบบแบ่งยอดนี้ให้แต่ละกองทุนตามยอด &quot;คงเหลือ&quot; ของกองทุนนั้นแล้ว ยอดรวมทั้งโรงพยาบาลยังเท่าเดิม</p>}
  </section>;
}

/** รายรับแยกรายกองทุน: chosen funds and ปีงบ per hospital, side by side or stacked. */
function MultiSection({ datasets, dash }: { datasets: readonly NhsoHospital[]; dash: NhsoDash }) {
  const id = useId();
  const funds = fundsByTotal(datasets, dash);
  const [chosenFunds, setFunds] = useState<string[] | null>(null);
  const picked = (chosenFunds ?? funds.slice(0, 3)).filter((key) => funds.includes(key));
  const [chosen, setMetric] = useState('');
  const metric = dash.metrics.includes(chosen) ? chosen : defaultMetric(dash.metrics);
  const [stacked, setStacked] = useState(false);
  const years = dash.dateCol ? datasetYears(datasets) : [];
  const [selectedYears, toggleYear] = useYearChips(years);
  const shownYears: (number | null)[] = years.length ? selectedYears.filter((year) => years.includes(year)) : [null];
  const rows = multiFund(datasets, dash, metric, picked, shownYears);
  const series: ChartSeries[] = picked.flatMap((key) => shownYears.map((year) => ({ name: `${fundName(key)}${year ? ` ปีงบ ${year}` : ''}`, tone: funds.indexOf(key) % 8, faded: shownYears.length > 1 && year !== shownYears[shownYears.length - 1] })));
  const columns = [...picked.flatMap((key) => shownYears.map((year) => [`${key}|${year}`, `${fundName(key)}${year ? ` ปีงบ ${year}` : ''}`] as const)), ...shownYears.map((year) => [`T|${year}`, `รวมที่เลือก${year ? ` ปีงบ ${year}` : ''}`] as const)];
  const toggleFund = (key: string, on: boolean) => setFunds(on ? [...picked, key] : picked.filter((value) => value !== key));
  return <section className="money-card" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>รายรับแยกรายกองทุน</h3>
    <div className="nhso-toolbar">
      <MetricSelect label="ยอด" metrics={dash.metrics} value={metric} onChange={setMetric} />
      {years.length > 0 && <Chips label="ปีงบที่จะเทียบ" options={years} selected={selectedYears} onToggle={toggleYear} />}
      <span className="nhso-field"><label htmlFor={`${id}-stack`}>รูปแบบ</label><select id={`${id}-stack`} value={stacked ? 'stack' : 'group'} onChange={(event) => setStacked(event.target.value === 'stack')}><option value="group">แท่งเรียงกัน</option><option value="stack">แท่งซ้อนกัน</option></select></span>
      <button type="button" className="button-secondary" onClick={() => setFunds([...funds])}>เลือกทุกกองทุน</button>
      <button type="button" className="button-secondary" onClick={() => setFunds([])}>ล้าง</button>
    </div>
    <Chips label="กองทุน" options={funds} selected={picked} onToggle={toggleFund} render={fundName} />
    <GroupedBarChart ariaLabel="รายรับแยกรายกองทุน" series={series} stacked={stacked} valueFormat={formatMoney}
      emptyText={!picked.length ? 'คลิกเลือกกองทุนด้านบนอย่างน้อย 1 กองทุน' : 'เลือกปีงบอย่างน้อย 1 ปี'}
      groups={shownYears.length ? rows.map((row) => ({ label: shortHospital(row.name), title: row.name, values: picked.flatMap((key) => shownYears.map((year) => row.cells[`${key}|${year}`] || 0)) })) : []} />
    <div className="money-table-wrap is-matrix"><table aria-label="รายรับแยกรายกองทุน">
      <thead><tr><th>โรงพยาบาล</th>{columns.map(([key, label]) => <th key={key} className="money-number">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td>{columns.map(([key]) => <td key={key} className="money-number">{key.startsWith('T|') ? <b>{formatMoney(row.cells[key] || 0)}</b> : formatMoney(row.cells[key] || 0)}</td>)}</tr>)}</tbody>
      <tfoot><tr><th>รวม {rows.length} โรงพยาบาล</th>{columns.map(([key]) => <th key={key} className="money-number">{formatMoney(rows.reduce((sum, row) => sum + (row.cells[key] || 0), 0))}</th>)}</tr></tfoot>
    </table></div>
  </section>;
}

/** เทียบรายกองทุน ตามปีงบประมาณ: the state lives in the parent so its table also becomes the เทียบปีงบ report sheet. */
export type YearChoice = { hospital: number | null; metric: string; years: number[] };

function YearSection({ datasets, dash, choice, setChoice, toggleYear, allYears }: { datasets: readonly NhsoHospital[]; dash: NhsoDash; choice: YearChoice; setChoice: (choice: YearChoice) => void; toggleYear: (year: number, on: boolean) => void; allYears: readonly number[] }) {
  const id = useId();
  const view = yearCompare(datasets, dash, choice.metric, choice.hospital, choice.years);
  const first = choice.years[0];
  const last = choice.years[choice.years.length - 1];
  const many = choice.years.length > 1;
  const diffCells = (byYear: Record<number, number>) => {
    if (!many) return null;
    const diff = byYear[last!]! - byYear[first!]!;
    return <><td className={`money-number ${sign(diff)}`}>{diff > 0 ? '+' : ''}{formatMoney(diff)}</td><td className={`money-number ${sign(diff)}`}>{percentText(changePercent(byYear[first!]!, byYear[last!]!))}</td></>;
  };
  const found = datasetYears(datasets);
  return <section className="money-card" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>เทียบรายกองทุน ตามปีงบประมาณ</h3>
    <div className="nhso-toolbar">
      <span className="nhso-field"><label htmlFor={`${id}-hospital`}>โรงพยาบาล</label>
        <select id={`${id}-hospital`} value={choice.hospital === null ? ALL : String(choice.hospital)} onChange={(event) => setChoice({ ...choice, hospital: event.target.value === ALL ? null : Number(event.target.value) })}>
          <option value={ALL}>ทุกโรงพยาบาลรวมกัน</option>{datasets.map((dataset, index) => <option key={dataset.name} value={index}>{dataset.name}</option>)}</select></span>
      <MetricSelect label="ยอด" metrics={dash.metrics} value={choice.metric} onChange={(metric) => setChoice({ ...choice, metric })} />
      <Chips label="ปีงบที่จะเทียบ" options={allYears} selected={choice.years} onToggle={toggleYear} />
    </div>
    <GroupedBarChart ariaLabel="เทียบรายกองทุน ตามปีงบประมาณ" series={yearSeries(choice.years, yearLabel)} valueFormat={formatMoney} emptyText="เลือกปีงบอย่างน้อย 1 ปี"
      groups={choice.years.length ? view.rows.map((row) => ({ label: fundName(row.key), values: choice.years.map((year) => row.byYear[year]!) })) : []} />
    <div className="money-table-wrap is-matrix"><table aria-label="เทียบรายกองทุน ตามปีงบประมาณ">
      <thead><tr><th>{dash.keyLabel}</th>{choice.years.map((year) => <th key={year} className="money-number">ปีงบ {year}</th>)}{many && <><th className="money-number">ผลต่าง {first}→{last}</th><th className="money-number">เปลี่ยนแปลง</th></>}</tr></thead>
      <tbody>{view.rows.map((row) => <tr key={row.key}><td>{fundName(row.key)}</td>{choice.years.map((year) => <td key={year} className="money-number">{formatMoney(row.byYear[year]!)}</td>)}{diffCells(row.byYear)}</tr>)}</tbody>
      <tfoot><tr><th>รวม</th>{choice.years.map((year) => <th key={year} className="money-number">{formatMoney(view.totals[year]!)}</th>)}{diffCells(view.totals)}</tr></tfoot>
    </table></div>
    <p className="money-note">{found.length < 2 ? `พบข้อมูลแค่ปีงบ ${found.join(', ')} นำเข้าไฟล์ของปีอื่นเพิ่มเพื่อเทียบ (นำเข้าทุกปีพร้อมกันได้ ระบบจะรวมไฟล์ของ รพ. เดียวกันให้เอง) ` : ''}ปีงบประมาณนับจากวันที่โอน: ต.ค.–ก.ย. เช่น 1 ต.ค. 2568 ถึง 30 ก.ย. 2569 คือปีงบ 2569</p>
  </section>;
}

/** แท็บรายงาน with search; the first 2,000 rows are shown and the Excel download has them all. */
function ReportTabs({ report }: { report: Record<string, NhsoTable> }) {
  const id = useId();
  const names = Object.keys(report);
  const [active, setActive] = useState('สรุป');
  const [query, setQuery] = useState('');
  const current = report[active] ? active : names[0]!;
  const table = report[current]!;
  const { rows, total } = searchReport(table, query);
  return <div className="nhso-report">
    <div className="nhso-tabs" role="tablist" aria-label="รายงาน">{names.map((name) => <button key={name} type="button" role="tab" aria-selected={name === current} className={name === current ? 'is-active' : ''} onClick={() => setActive(name)}>{name} ({report[name]!.rows.length.toLocaleString('en-US')})</button>)}</div>
    <input type="search" className="money-search" aria-label="ค้นหาในรายงาน" placeholder="ค้นหา key หรือค่า..." value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="money-table-wrap is-tall" role="tabpanel" aria-labelledby={`${id}-table`}><table id={`${id}-table`} aria-label={current}>
      <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={table.columns.length}>ไม่มีข้อมูล</td></tr> : rows.map((row, index) => <tr key={index}>{table.columns.map((column) => {
        const text = reportCell(row[column]);
        const odd = Array.isArray(row._odd) && (row._odd as string[]).includes(column);
        return <td key={column} className={text === '✓' ? 'nhso-yes' : text === '✗' ? 'nhso-no' : odd ? 'nhso-bad' : undefined}>{text}</td>;
      })}</tr>)}</tbody>
    </table></div>
    {total > MAX_SHOW && <p className="money-note">แสดง {MAX_SHOW.toLocaleString('en-US')} จาก {total.toLocaleString('en-US')} แถว (ดาวน์โหลดรายงานเพื่อดูทั้งหมด)</p>}
  </div>;
}

/** รายละเอียดและรายงาน: stats, the three comparisons, report tabs and ดาวน์โหลดรายงาน Excel. */
export function NhsoDetails({ datasets, dash, funds, stats, report, yearChoice, setYearChoice, toggleYear, allYears, onExport }: {
  datasets: readonly NhsoHospital[]; dash: NhsoDash | null; funds: readonly string[]; stats: readonly [number, string][]; report: Record<string, NhsoTable>;
  yearChoice: YearChoice; setYearChoice: (choice: YearChoice) => void; toggleYear: (year: number, on: boolean) => void; allYears: readonly number[]; onExport: () => void;
}) {
  return <section className="money-card nhso-details" aria-labelledby="nhso-details-title">
    <div className="money-card-head"><h3 id="nhso-details-title">รายละเอียดและรายงาน</h3><button type="button" onClick={onExport}>ดาวน์โหลดรายงาน Excel</button></div>
    <dl className="nhso-stats">{stats.map(([count, label]) => <div key={label}><dt>{label}</dt><dd>{count.toLocaleString('en-US')}</dd></div>)}</dl>
    {dash && <>
      <FundSection datasets={datasets} dash={dash} funds={funds} />
      <MultiSection datasets={datasets} dash={dash} />
      {allYears.length > 0 && <YearSection datasets={datasets} dash={dash} choice={yearChoice} setChoice={setYearChoice} toggleYear={toggleYear} allYears={allYears} />}
    </>}
    <ReportTabs report={report} />
  </section>;
}
