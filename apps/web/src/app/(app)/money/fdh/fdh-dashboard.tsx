'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { GroupedBarChart } from '../../../../components/grouped-bar-chart';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { buildCases, byErrorCode, byFundVisit, byMoneyColumn, bySubFund, filterCases, MONEY_COLUMNS, STATUS, summarize, type FdhPayload, type FdhStatus } from '../../../../lib/money/fdh-core';
import { activeFilterTags, dateBounds, fdhExportSheets, fdhStatusLine, filterArgs, filterOptions, initialFilters, type FdhFilters } from '../../../../lib/money/fdh-views';
import { FdhDetail, peopleRows, type FdhTab, type PeopleQuery } from './fdh-detail';
import { FdhDialog, type FdhOpen } from './fdh-dialog';
import { int, money, pct, Progress } from './fdh-shared';

type Stored = FdhPayload & { reps: { uploaded_at?: string }[]; stms: { period?: string; uploaded_at?: string }[] };
const TOP_CHART = 15;
const STATUSES = Object.keys(STATUS) as FdhStatus[];

/**
 * ติดตามกองทุนย่อย FDH: loads every stored REP and STM document and computes the page in the browser with the fdh-core
 * port, as the legacy `dashboard.js` did: filters, KPI cards, status strip, sub-funds, STM money columns and the four tabs.
 */
export function FdhDashboard({ canManage }: { canManage: boolean }) {
  const ids = useId();
  const [data, setData] = useState<Stored | null>(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState<FdhFilters>(() => initialFilters({ from: '', to: '' }));
  const [tab, setTab] = useState<FdhTab>('cases');
  const [people, setPeople] = useState<PeopleQuery>({ q: '', sub: '' });
  const [open, setOpen] = useState<FdhOpen | null>(null);

  const all = useMemo(() => (data ? buildCases(data) : []), [data]);
  const bounds = useMemo(() => dateBounds(all), [all]);

  const load = useCallback(async () => {
    setLoading(true); setFailure('');
    try {
      const response = await fetch('/api/money/fdh/documents?full=1', { cache: 'no-store' });
      const body = (await response.json()) as Partial<Stored> & { error?: string; message?: string };
      if (!response.ok || !body.reps || !body.stms) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      const stored = body as Stored;
      const edges = dateBounds(buildCases(stored));
      setF((current) => ({ ...current, from: edges.from, to: edges.to }));
      setData(stored);
    } catch (error) {
      setFailure(`โหลดข้อมูลไม่ได้: ${error instanceof Error ? error.message : String(error)}`);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const base = useMemo(() => filterCases(all, { ...filterArgs(f, bounds, true), q: '' }), [all, f, bounds]);
  const view = useMemo(() => filterCases(all, filterArgs(f, bounds, false)), [all, f, bounds]);
  const peopleCases = useMemo(() => filterCases(all, { ...filterArgs(f, bounds, false), q: '' }), [all, f, bounds]);
  const funds = useMemo(() => byFundVisit(peopleCases), [peopleCases]);
  const summary = useMemo(() => summarize(base), [base]);
  const subs = useMemo(() => bySubFund(base), [base]);
  const moneyRows = useMemo(() => byMoneyColumn(base), [base]);
  const errors = useMemo(() => byErrorCode(base), [base]);
  const options = useMemo(() => filterOptions(all), [all]);
  const tags = activeFilterTags(f, bounds);

  function setFilter(patch: Partial<FdhFilters>, toCases = false) {
    setF((current) => ({ ...current, ...patch }));
    if (toCases) {
      setTab('cases');
      document.getElementById('fdh-detail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }
  const clear = () => setF(initialFilters(bounds));

  const statusChips = (label: string, toCases: boolean) => <div className="fdh-chips" role="group" aria-label={label}>
    {STATUSES.map((key) => <button key={key} type="button" className={`fdh-chip st-${key}${f.status === key ? ' is-on' : ''}`} aria-pressed={f.status === key}
      onClick={() => setFilter({ status: f.status === key ? '' : key, errorCode: '', fixedC: false }, toCases)}>{STATUS[key].icon} {STATUS[key].label} <b>{int(summary.byStatus[key])}</b></button>)}
    <button type="button" className={`fdh-chip st-fixed${f.fixedC ? ' is-on' : ''}`} aria-pressed={f.fixedC} onClick={() => setFilter({ fixedC: !f.fixedC, status: '', errorCode: '' }, toCases)}>🔧 แก้ไขแล้ว ผ่านแล้ว <b>{int(summary.fixedC)}</b></button>
  </div>;

  const exportExcel = () => {
    const sheets = fdhExportSheets({ view, base, people: peopleRows(peopleCases, people).list, funds });
    void import('../../../../lib/money/fdh-export').then((module) => module.downloadFdhExport(sheets));
  };

  const filesLink = canManage ? <p>ผู้ดูแลอัปโหลดไฟล์ REP และ STM ได้ที่ <Link href="/money/fdh/files">หน้าจัดการไฟล์</Link></p> : <p>ติดต่อผู้ดูแล Smart Money เพื่ออัปโหลดไฟล์</p>;
  const empty = data !== null && all.length === 0;
  const moneyCols = MONEY_COLUMNS.filter((column) => moneyRows.some((row) => row[column.key]));
  const select = (key: 'period' | 'right' | 'subFund', label: string, all: string, items: [string, number][]) => <span className="fdh-field">
    <label htmlFor={`${ids}-${key}`}>{label}</label>
    <select id={`${ids}-${key}`} value={f[key]} onChange={(event) => setFilter({ [key]: event.target.value })}>
      <option value="">{all}</option>{items.map(([value, count]) => <option key={value} value={value}>{value} ({int(count)})</option>)}
    </select>
  </span>;

  return <section className="nhso fdh">
    <h2>ติดตามกองทุนย่อย FDH</h2>
    <div className="nhso-bar">
      <span className="money-note" role="status">{data === null ? (failure ? '' : 'กำลังโหลดข้อมูล...') : empty ? '' : fdhStatusLine(data)}</span>
      <div className="nhso-bar-actions">
        <button type="button" onClick={() => void load()} disabled={loading}>โหลดข้อมูลล่าสุด</button>
        {canManage && <Link className="nhso-link-button" href="/money/fdh/files">จัดการไฟล์ (ผู้ดูแล)</Link>}
      </div>
    </div>
    {failure && <p className="money-alert" role="alert">{failure}</p>}

    {empty && <div className="money-empty"><h3>ยังไม่มีข้อมูล</h3>{filesLink}</div>}

    {all.length > 0 && <>
      <section className="money-filter search-card fdh-filters" aria-label="ตัวกรอง">
        <div className="fdh-filter-grid">
          <span className="fdh-field"><span>วันรับบริการ ตั้งแต่</span><ThaiDateInput value={f.from} aria-label="วันรับบริการตั้งแต่" onChange={(iso) => setFilter({ from: iso })} /></span>
          <span className="fdh-field"><span>ถึง</span><ThaiDateInput value={f.to} aria-label="วันรับบริการถึง" onChange={(iso) => setFilter({ to: iso })} /></span>
          {select('period', 'งวด STM', 'ทุกงวด', options.periods)}
          {select('right', 'สิทธิหลัก', 'ทุกสิทธิ', options.rights)}
          {select('subFund', 'กองทุนย่อย', 'ทุกกองทุนย่อย', options.subs)}
          <span className="fdh-field"><label htmlFor={`${ids}-status`}>สถานะ</label>
            <select id={`${ids}-status`} value={f.status} onChange={(event) => { const status = event.target.value as FdhStatus | ''; setFilter({ fixedC: false, status, errorCode: status === 'error' ? f.errorCode : '' }); }}>
              <option value="">ทุกสถานะ</option>{STATUSES.map((key) => <option key={key} value={key}>{STATUS[key].icon} {STATUS[key].label}</option>)}
            </select></span>
        </div>
        <div className="fdh-filter-foot">
          <span className="fdh-active">{tags.length ? <><span>กำลังกรอง:</span> {tags.map((tag) => <span key={tag} className="fdh-tag">{tag}</span>)}</> : 'แสดงข้อมูลทั้งหมด'}</span>
          <button type="button" className="button-secondary" onClick={clear}>ล้างตัวกรอง</button>
        </div>
      </section>

      <section className="fdh-kpis" aria-label="สรุป">
        <div className="money-kpi"><span>เคสทั้งหมด</span><strong>{int(summary.cases)}</strong><small>นับ VN ไม่ซ้ำ{summary.noSeq ? ` · ไม่มี VN ${int(summary.noSeq)}` : ''}</small></div>
        <div className="money-kpi"><span>เรียกเก็บ</span><strong>{money(summary.charge)}</strong><small>บาท</small></div>
        <div className="money-kpi"><span>ชดเชยตาม REP</span><strong>{money(summary.repNet)}</strong><small>บาท</small></div>
        <div className="money-kpi is-accent"><span>ได้รับตาม STM</span><strong>{money(summary.stmTotal)}</strong><small><Progress value={summary.paidPct} />{pct(summary.paidPct)} ของ REP</small></div>
        <div className="money-kpi fdh-kpi-pending"><span>รอ STM</span><strong>{money(summary.pendingNet)}</strong><small>{int(summary.byStatus.pending)} เคส</small></div>
        <div className="money-kpi fdh-kpi-error"><span>ติด C / DENY</span><strong>{int(summary.errorCases)} เคส</strong><small>{summary.fixedC ? `แก้แล้วผ่าน ${int(summary.fixedC)} เคส` : 'ต้องแก้แล้วส่งใหม่'}</small></div>
      </section>
      {statusChips('สถานะ', true)}

      <section className="money-card">
        <h3>รายกองทุนย่อย <small>เรียงตามชดเชยตาม REP · กดชื่อกองทุนเพื่อดูรายเคส</small></h3>
        <GroupedBarChart ariaLabel="กราฟชดเชยตาม REP เทียบได้รับตาม STM รายกองทุนย่อย" valueFormat={money} emptyText="ไม่มีข้อมูลตามตัวกรอง"
          series={[{ name: 'ชดเชยตาม REP', tone: 1 }, { name: 'ได้รับตาม STM', tone: 0 }]}
          groups={subs.slice(0, TOP_CHART).map((row) => ({ label: row.subFund, values: [row.repNet, row.stmTotal] }))} />
        <div className="money-table-wrap"><table aria-label="รายกองทุนย่อย"><thead><tr><th>กองทุนย่อย</th><th className="money-number">เคส</th><th className="money-number">เรียกเก็บ</th><th className="money-number">ชดเชย REP</th>
          <th className="money-number">ได้รับ STM</th><th className="money-number">รอ STM</th><th className="money-number">ติด C</th><th>ได้รับแล้ว</th></tr></thead><tbody>
          {subs.map((row) => <tr key={row.subFund} className={f.subFund === row.subFund ? 'is-selected' : ''}>
            <td><button type="button" className="link-button" aria-pressed={f.subFund === row.subFund} onClick={() => setFilter({ subFund: f.subFund === row.subFund ? '' : row.subFund }, true)}><b>{row.subFund}</b></button></td>
            <td className="money-number">{int(row.cases)}</td><td className="money-number">{money(row.charge)}</td><td className="money-number">{money(row.repNet)}</td>
            <td className="money-number fdh-ok">{money(row.stmTotal)}</td><td className="money-number">{money(row.pendingNet)}</td>
            <td className={`money-number${row.errorCases ? ' fdh-bad' : ' fdh-muted'}`}>{int(row.errorCases)}</td>
            <td className="fdh-prog"><Progress value={row.paidPct} /><span>{pct(row.paidPct)}</span></td></tr>)}
          {subs.length === 0 && <tr><td colSpan={8} className="fdh-muted">ไม่มีข้อมูลตามตัวกรอง</td></tr>}
        </tbody></table></div>
        <p className="money-note">เคสที่มีหลายกองทุนย่อยนับในทุกกลุ่ม ผลรวมของตารางนี้จึงมากกว่ายอดในการ์ดสรุปด้านบน</p>
      </section>

      <section className="money-card">
        <h3>ยอดตามคอลัมน์เงิน STM <small>ยอดพึงรับแยกงวด ใช้กระทบยอดกับรายงานพึงรับของ สปสช.</small></h3>
        {moneyRows.length > 1
          ? <div className="money-table-wrap"><table aria-label="ยอดตามคอลัมน์เงิน STM"><thead><tr><th>งวด</th><th className="money-number">แถว</th>{moneyCols.map((column) => <th key={column.key} className="money-number">{column.label}</th>)}<th className="money-number">ยอดชดเชยทั้งสิ้น</th></tr></thead><tbody>
            {moneyRows.map((row) => <tr key={row.period} className={row.period === 'รวม' ? 'fdh-sum' : ''}><td>{row.period}</td><td className="money-number">{int(row.rows)}</td>
              {moneyCols.map((column) => <td key={column.key} className={`money-number${row[column.key] ? '' : ' fdh-muted'}`}>{money(row[column.key])}</td>)}<td className="money-number"><b>{money(row.total)}</b></td></tr>)}
          </tbody></table></div>
          : <p className="fdh-muted">ยังไม่มีเคสใน STM ตามตัวกรองนี้</p>}
      </section>

      <FdhDetail tab={tab} onTab={setTab} view={view} peopleCases={peopleCases} funds={funds} people={people} onPeople={setPeople} errors={errors} errorCode={f.errorCode}
        q={f.q} onQuery={(q) => setFilter({ q })} chips={statusChips('สถานะในรายเคส', false)} onCode={(code) => setFilter({ status: 'error', errorCode: code }, true)}
        onOpen={setOpen} onExport={exportExcel} />
    </>}

    {open && <FdhDialog open={open} onOpen={setOpen} onClose={() => setOpen(null)} />}
  </section>;
}
