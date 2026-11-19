'use client';

import Link from 'next/link';
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import type { DpStoredRecord, DpYearSummary } from '@backoffice/core';
import { BarChart } from '../../../../components/bar-chart';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import {
  addDays, dpActiveTags, dpCountOptions, dpExportSheets, dpInitialState, dpList, dpStatusLine, dpTrendLabel, dpView, dpYearOptions, monthEnd, type DpMode, type DpState
} from '../../../../lib/money/dp-views';
import { int, money } from '../fdh/fdh-shared';
import { DpDetail, type DpTab } from './dp-detail';

type Payload = { years: DpYearSummary[]; records: DpStoredRecord[] };
const MODES: [DpMode, string][] = [['year', 'รายปีงบ'], ['day', 'รายวัน'], ['range', 'เลือกช่วงเวลา']];

/**
 * Point ฟื้นฟูผู้พิการ: loads every stored record and computes the page in the browser with the dp-core port, as the legacy
 * `dashboard.js` did: time view, filters, KPI cards, services, trend, ปีงบ summary and the รายการ / ติดสถานะ tabs.
 */
export function DpDashboard({ canManage }: { canManage: boolean }) {
  const ids = useId();
  const [data, setData] = useState<Payload | null>(null);
  const [failure, setFailure] = useState('');
  const [loading, setLoading] = useState(false);
  const [s, setS] = useState<DpState | null>(null);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [tab, setTab] = useState<DpTab>('list');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setFailure('');
    try {
      const response = await fetch('/api/money/disability/records?full=1', { cache: 'no-store' });
      const body = (await response.json()) as Partial<Payload> & { error?: string; message?: string };
      if (!response.ok || !body.records || !body.years) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      setData(body as Payload);
      setS((current) => dpInitialState(body.records!, current ?? undefined));
    } catch (error) {
      setFailure(`โหลดข้อมูลไม่ได้: ${error instanceof Error ? error.message : String(error)}`);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const records = useMemo(() => data?.records ?? [], [data]);
  const state = s ?? dpInitialState(records);
  const view = useMemo(() => dpView(records, state), [records, state]);
  const list = useMemo(() => dpList(view.scoped, state.statusCode, query.trim()), [view, state.statusCode, query]);
  const options = useMemo(() => ({ years: dpYearOptions(records), right: dpCountOptions(records, 'right'), target: dpCountOptions(records, 'target'), svcType: dpCountOptions(records, 'svc_type') }), [records]);
  const tags = dpActiveTags({ ...state, q: q.trim() });

  // Every change of the time view or a filter starts รายการ on its first page, as the legacy page did.
  const set = (patch: Partial<DpState>) => { setS({ ...state, ...patch }); setPage(0); };
  const toList = () => { setTab('list'); document.getElementById('dp-detail')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); };
  const pickService = (name: string) => { const service = state.service === name ? '' : name; set({ service }); if (service) toList(); };
  const pickCode = (code: string) => { const statusCode = state.statusCode === code ? '' : code; set({ statusCode }); if (statusCode) toList(); };
  const clear = () => { set({ right: '', target: '', svcType: '', service: '', statusCode: '', q: '' }); setQ(''); };
  const exportExcel = () => { const sheets = dpExportSheets(state, view, list); void import('../../../../lib/money/dp-export').then((module) => module.downloadDpExport(sheets)); };

  const empty = data !== null && records.length === 0;
  const daily = view.trend.unit === 'day';
  const select = (key: 'right' | 'target' | 'svcType', label: string, all: string, items: [string, number][]) => <span className="fdh-field">
    <label htmlFor={`${ids}-${key}`}>{label}</label>
    <select id={`${ids}-${key}`} value={state[key]} onChange={(event) => set({ [key]: event.target.value })}>
      <option value="">{all}</option>{items.map(([value, count]) => <option key={value} value={value}>{value} ({int(count)})</option>)}
    </select>
  </span>;
  const row = (t: { visits: number; persons: number; claim: number; eligible: number; diff: number; flagged: number }) => <>
    <td className="money-number"><b>{int(t.visits)}</b></td><td className="money-number">{int(t.persons)}</td><td className="money-number">{money(t.claim)}</td>
    <td className="money-number fdh-ok">{money(t.eligible)}</td><td className="money-number">{money(t.diff)}</td><td className={`money-number${t.flagged ? ' fdh-bad' : ' fdh-muted'}`}>{int(t.flagged)}</td>
  </>;

  return <section className="nhso fdh dp">
    <h2>Point ฟื้นฟูผู้พิการ</h2>
    <div className="nhso-bar">
      <span className="money-note" role="status">{data === null ? (failure ? '' : 'กำลังโหลดข้อมูล...') : empty ? 'ยังไม่มีข้อมูล' : dpStatusLine(records, data.years)}</span>
      <div className="nhso-bar-actions">
        <button type="button" onClick={() => void load()} disabled={loading}>โหลดข้อมูลล่าสุด</button>
        {canManage && <Link className="nhso-link-button" href="/money/disability/files">จัดการไฟล์ (ผู้ดูแล)</Link>}
      </div>
    </div>
    {failure && <p className="money-alert" role="alert">{failure}</p>}

    {empty && <div className="money-empty"><h3>ยังไม่มีข้อมูล</h3>
      {canManage ? <p>ผู้ดูแลอัปโหลดไฟล์ข้อมูลบริการฟื้นฟู (.csv / .zip) ได้ที่ <Link href="/money/disability/files">หน้าจัดการไฟล์</Link></p> : <p>ติดต่อผู้ดูแล Smart Money เพื่ออัปโหลดไฟล์</p>}</div>}

    {records.length > 0 && <>
      <section className="money-filter search-card fdh-filters" aria-label="ช่วงเวลาและตัวกรอง">
        <div className="nhso-tabs" role="tablist" aria-label="มุมมองเวลา">
          {MODES.map(([mode, label]) => <button key={mode} type="button" role="tab" aria-selected={state.mode === mode} className={state.mode === mode ? 'is-active' : ''} onClick={() => set({ mode })}>{label}</button>)}
        </div>
        <div className="fdh-filter-grid">
          {state.mode === 'year' && <span className="fdh-field"><label htmlFor={`${ids}-fy`}>ปีงบประมาณ (ต.ค.–ก.ย.)</label>
            <select id={`${ids}-fy`} value={state.fy} onChange={(event) => set({ fy: event.target.value })}>
              <option value="">ทุกปีงบ</option>{options.years.map(([fy, count]) => <option key={fy} value={String(fy)}>{`ปีงบ ${fy} (${int(count)} ครั้ง)`}</option>)}
            </select></span>}
          {state.mode === 'day' && <span className="fdh-field"><span>วันที่รับบริการ</span><span className="dp-day">
            <button type="button" className="button-secondary" aria-label="วันก่อนหน้า" onClick={() => set({ day: addDays(state.day, -1) })}>‹</button>
            <ThaiDateInput value={state.day} aria-label="วันที่รับบริการ" onChange={(iso) => { if (iso) set({ day: iso }); }} />
            <button type="button" className="button-secondary" aria-label="วันถัดไป" onClick={() => set({ day: addDays(state.day, 1) })}>›</button>
          </span></span>}
          {state.mode === 'range' && <>
            <span className="fdh-field"><span>ตั้งแต่</span><ThaiDateInput value={state.from} aria-label="ตั้งแต่วันที่" onChange={(iso) => { if (iso) set({ from: iso }); }} /></span>
            <span className="fdh-field"><span>ถึง</span><ThaiDateInput value={state.to} aria-label="ถึงวันที่" onChange={(iso) => { if (iso) set({ to: iso }); }} /></span>
          </>}
          {select('right', 'สิทธิหลัก', 'ทุกสิทธิ', options.right)}
          {select('target', 'กลุ่มเป้าหมาย', 'ทุกกลุ่ม', options.target)}
          {select('svcType', 'ประเภทการรับบริการ', 'ทุกประเภท', options.svcType)}
        </div>
        <div className="fdh-filter-foot">
          <span className="fdh-active"><span>กำลังแสดง:</span> {tags.map((tag) => <span key={tag} className="fdh-tag">{tag}</span>)}</span>
          <button type="button" className="button-secondary" onClick={clear}>ล้างตัวกรอง</button>
        </div>
      </section>

      <section className="fdh-kpis" aria-label="สรุป">
        <div className="money-kpi"><span>จำนวนครั้ง</span><strong>{int(view.kpis.visits)}</strong><small>ครั้งที่ให้บริการ</small></div>
        <div className="money-kpi"><span>ผู้รับบริการ</span><strong>{int(view.kpis.persons)}</strong><small>คน</small></div>
        <div className="money-kpi"><span>ราคาที่ขอเบิก (AE)</span><strong>{money(view.kpis.claim)}</strong><small>บาท</small></div>
        <div className="money-kpi is-accent"><span>ราคาที่พึงเบิก (AF)</span><strong>{money(view.kpis.eligible)}</strong><small>บาท ไม่รวมติดสถานะ</small></div>
        <div className="money-kpi"><span>ส่วนต่าง</span><strong>{money(view.kpis.diff)}</strong><small>ขอเบิก − พึงเบิก</small></div>
        <div className="money-kpi fdh-kpi-error"><span>ติดสถานะ</span><strong>{int(view.kpis.flagged)} ครั้ง</strong><small>{view.kpis.flagged ? `พึงเบิกตามไฟล์ ${money(view.kpis.flaggedEligible)} บาท` : 'ไม่มี'}</small></div>
      </section>

      <section className="money-card">
        <h3>รายชื่อบริการฟื้นฟู <small>กดชื่อบริการเพื่อดูรายการของบริการนั้น</small></h3>
        <div className="money-table-wrap"><table aria-label="รายชื่อบริการฟื้นฟู"><thead><tr><th>ชื่อบริการฟื้นฟู</th><th>รหัส</th><th className="money-number">ครั้ง</th><th className="money-number">คน</th>
          <th className="money-number">ขอเบิก</th><th className="money-number">พึงเบิก</th><th className="money-number">ส่วนต่าง</th><th className="money-number">ติดสถานะ</th></tr></thead><tbody>
          {view.services.map((r) => <tr key={r.service} className={state.service === r.service ? 'is-selected' : ''}>
            <td><button type="button" className="link-button" aria-pressed={state.service === r.service} onClick={() => pickService(r.service)}>{r.service}</button></td>
            <td className="fdh-mono">{r.code}</td>{row(r)}</tr>)}
          {view.services.length === 0 && <tr><td colSpan={8} className="fdh-muted">ไม่มีบริการในช่วงเวลา/ตัวกรองนี้</td></tr>}
          {view.services.length > 1 && <tr className="fdh-sum"><td>{`รวม ${int(view.services.length)} บริการ`}</td><td></td>{row(view.total)}</tr>}
        </tbody></table></div>
        <BarChart ariaLabel="กราฟรวมราคาที่พึงเบิกได้รายบริการฟื้นฟู" valueFormat={money} bars={view.services.map((r) => ({ label: r.service, value: r.eligible }))} />
        <p className="money-note">ขอเบิก = คอลัมน์ AE &quot;รวมราคาที่ขอเบิก&quot; · พึงเบิก = คอลัมน์ AF &quot;รวมราคาที่พึงเบิกได้&quot; ไม่รวมแถวที่ช่องสถานะมีรหัส (ติดสถานะ ดูรหัสได้ในแท็บด้านล่าง) · กราฟแสดงรวมราคาที่พึงเบิกได้ · คน = นับเลขบัตรประชาชนไม่ซ้ำ</p>
      </section>

      <section className="money-card">
        <h3>{`แนวโน้ม${daily ? 'รายวัน' : 'รายเดือน'}`} <small>{state.mode === 'day' ? 'ทั้งเดือนของวันที่เลือก · ' : ''}{`กดวันที่หรือเดือนในตารางเพื่อดู${daily ? 'วันนั้น' : 'เดือนนั้น'}`}</small></h3>
        <BarChart ariaLabel="กราฟจำนวนครั้งและราคาพึงเบิกตามช่วงเวลา" valueFormat={int}
          bars={view.trend.buckets.map((b) => ({ label: dpTrendLabel(view.trend.unit, b.key), sublabel: `พึงเบิก ${money(b.eligible)}`, value: b.visits }))} />
        <details className="dp-trend-table"><summary>ตารางแนวโน้ม</summary>
          <div className="money-table-wrap"><table aria-label="ตารางแนวโน้ม"><thead><tr><th>{daily ? 'วันที่' : 'เดือน'}</th><th className="money-number">ครั้ง</th><th className="money-number">ขอเบิก</th><th className="money-number">พึงเบิก</th></tr></thead><tbody>
            {view.trend.buckets.map((b) => <tr key={b.key} className={state.mode === 'day' && b.key === state.day ? 'is-selected' : ''}>
              <td><button type="button" className="link-button" onClick={() => (daily ? set({ mode: 'day', day: b.key }) : set({ mode: 'range', from: `${b.key}-01`, to: monthEnd(b.key) }))}>{dpTrendLabel(view.trend.unit, b.key)}</button></td>
              <td className="money-number">{int(b.visits)}</td><td className="money-number">{money(b.claim)}</td><td className="money-number">{money(b.eligible)}</td></tr>)}
          </tbody></table></div>
        </details>
      </section>

      <section className="money-card">
        <h3>สรุปรายปีงบ <small>ใช้ตัวกรองสิทธิ / กลุ่มเป้าหมาย / ประเภท แต่ไม่จำกัดช่วงเวลา · กดปีงบเพื่อดูปีนั้น</small></h3>
        <div className="money-table-wrap"><table aria-label="สรุปรายปีงบ"><thead><tr><th>ปีงบ</th><th className="money-number">ครั้ง</th><th className="money-number">คน</th><th className="money-number">ขอเบิก</th>
          <th className="money-number">พึงเบิก</th><th className="money-number">ส่วนต่าง</th><th className="money-number">ติดสถานะ</th></tr></thead><tbody>
          {view.years.map((r) => <tr key={r.fy} className={state.mode === 'year' && Number(state.fy) === r.fy ? 'is-selected' : ''}>
            <td><button type="button" className="link-button" onClick={() => set({ mode: 'year', fy: String(r.fy) })}><b>{r.fy}</b></button></td>
            <td className="money-number">{int(r.visits)}</td><td className="money-number">{int(r.persons)}</td><td className="money-number">{money(r.claim)}</td>
            <td className="money-number fdh-ok">{money(r.eligible)}</td><td className="money-number">{money(r.diff)}</td><td className={`money-number${r.flagged ? ' fdh-bad' : ' fdh-muted'}`}>{int(r.flagged)}</td></tr>)}
          {view.years.length === 0 && <tr><td colSpan={7} className="fdh-muted">ไม่มีข้อมูล</td></tr>}
        </tbody></table></div>
      </section>

      <DpDetail tab={tab} onTab={setTab} page={page} onPage={setPage} list={list} flags={view.flags} service={state.service} statusCode={state.statusCode} q={q} onQuery={setQ}
        onClear={(key) => set({ [key]: '' })} onCode={pickCode} onExport={exportExcel} />
    </>}
  </section>;
}
