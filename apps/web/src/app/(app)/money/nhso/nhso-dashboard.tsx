'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { NhsoDataset } from '@backoffice/core';
import { bangkokToday, formatBangkokDateOnly, formatBangkokTime } from '../../../../lib/bangkok-time';
import { buildDatasets, dashboardMetrics, defaultSettings, runCompare, type NhsoSettings, type NhsoSettingsInput, type NhsoTable } from '../../../../lib/money/nhso-core';
import { datasetYears, defaultMetric, fundHospitalSheet, yearCompare, type NhsoDash } from '../../../../lib/money/nhso-views';
import { NhsoDetails, type YearChoice } from './nhso-details';
import { NhsoOverview } from './nhso-overview';
import { Chips, useYearChips } from './nhso-shared';

export const NHSO_SETTINGS_KEY = 'nhso.settings';
type Saved = NhsoSettingsInput & { headerRow?: number };
type Form = Pick<NhsoSettings, 'keys' | 'cmp' | 'pivotCol' | 'tol' | 'ignoreCase' | 'aggregate'>;

function loadSaved(): Saved {
  try { return (JSON.parse(window.localStorage.getItem(NHSO_SETTINGS_KEY) || '{}') as Saved) || {}; } catch { return {}; }
}
function save(value: Saved) {
  try { window.localStorage.setItem(NHSO_SETTINGS_KEY, JSON.stringify(value)); } catch { /* private mode: settings are not remembered */ }
}
const uploadedText = (instant: string) => `${formatBangkokDateOnly(bangkokToday(new Date(instant)))} ${formatBangkokTime(instant)}`;
const EMPTY_FORM: Form = { keys: [], cmp: [], pivotCol: '', tol: 0, ignoreCase: true, aggregate: true };

/**
 * เงินโอน สปสช. รายกองทุน เทียบรายโรงพยาบาล: loads every stored report and computes the whole page in the browser, as the
 * legacy page did. Compare settings are remembered in this browser only.
 */
export function NhsoDashboard({ canManage }: { canManage: boolean }) {
  const ids = useId();
  const [stored, setStored] = useState<NhsoDataset[] | null>(null);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<Saved>({});
  const [headerRow, setHeaderRow] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [applied, setApplied] = useState<Form | null>(null);
  const [setupError, setSetupError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setFailed(false); setStatus('กำลังโหลดข้อมูล...');
    try {
      const response = await fetch('/api/money/nhso/datasets?rows=1', { cache: 'no-store' });
      const body = (await response.json()) as { datasets?: NhsoDataset[]; error?: string };
      if (!response.ok || !body.datasets) throw new Error(body.error ?? `HTTP ${response.status}`);
      const datasets = body.datasets;
      setStored(datasets);
      const last = datasets.map((dataset) => dataset.uploadedAt).sort().pop();
      const years = [...new Set(datasets.map((dataset) => dataset.fy))].sort((a, b) => a - b);
      setStatus(datasets.length ? `ข้อมูลล่าสุด ${last ? uploadedText(last) : '-'} · ${datasets.length} ไฟล์ (ปีงบ ${years.join(', ')})` : '');
    } catch {
      setFailed(true);
      setStatus('⚠ โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const remembered = loadSaved();
    setSaved(remembered);
    setHeaderRow(Number(remembered.headerRow) || 0);
    void load();
  }, [load]);

  const datasets = useMemo(() => buildDatasets((stored ?? []).map((dataset) => ({ hcode: dataset.hcode, fy: dataset.fy, fileName: dataset.fileName, rows: dataset.rows })), { headerRow }), [stored, headerRow]);
  const defaults = useMemo(() => (datasets.length >= 2 ? defaultSettings(datasets, form.keys.length ? form : saved) : null), [datasets]);

  const run = useCallback((settings: Form, remembered: number) => {
    if (!settings.keys.length) { setSetupError('กรุณาเลือกคอลัมน์ key อย่างน้อย 1 คอลัมน์'); return; }
    setSetupError('');
    const next = { ...settings, headerRow: remembered };
    save(next); setSaved(next);
    setApplied({ ...settings });
  }, []);

  // New data or a new header row: fill the settings from what was chosen (or remembered) and compare again, as the legacy page did.
  useEffect(() => {
    if (!defaults) { setApplied(null); return; }
    const settings: Form = { keys: defaults.keys, cmp: defaults.cmp, pivotCol: defaults.pivotCol, tol: form.keys.length ? form.tol : defaults.tol, ignoreCase: form.keys.length ? form.ignoreCase : defaults.ignoreCase, aggregate: form.keys.length ? form.aggregate : defaults.aggregate };
    setForm(settings);
    run(settings, headerRow);
  }, [defaults]);

  const compare = useMemo(() => (applied && datasets.length >= 2 ? runCompare(datasets, applied) : null), [applied, datasets]);
  const dash: NhsoDash | null = useMemo(() => {
    if (!compare) return null;
    const { metrics, dateCol } = dashboardMetrics(datasets, compare.cmp);
    return metrics.length ? { keyOf: compare.keyOf, metrics, dateCol, keyLabel: compare.keyLabel } : null;
  }, [compare, datasets]);
  const fundSheet = useMemo(() => (dash && compare ? fundHospitalSheet(datasets, compare.allKeys, dash) : null), [dash, compare, datasets]);

  const allYears = useMemo(() => (dash?.dateCol ? datasetYears(datasets) : []), [dash, datasets]);
  const [yearYears, toggleYearYear] = useYearChips(allYears);
  const [yearHospital, setYearHospital] = useState<number | null>(null);
  const [yearMetric, setYearMetric] = useState('');
  const yearChoice: YearChoice = { hospital: yearHospital !== null && yearHospital < datasets.length ? yearHospital : null, metric: dash && dash.metrics.includes(yearMetric) ? yearMetric : defaultMetric(dash?.metrics ?? []), years: yearYears.filter((year) => allYears.includes(year)) };

  const report = useMemo(() => {
    if (!compare) return null;
    const out: Record<string, NhsoTable> = {};
    for (const [name, table] of Object.entries(compare.report)) {
      if (name === 'ยอดตามกองทุน-รพ') { if (fundSheet) out[name] = fundSheet.sheet; } else if (table) out[name] = table;
    }
    if (dash && allYears.length) out['เทียบปีงบ'] = yearCompare(datasets, dash, yearChoice.metric, yearChoice.hospital, yearChoice.years).sheet;
    return out;
  }, [compare, fundSheet, dash, allYears, datasets, yearChoice.metric, yearChoice.hospital, yearChoice.years.join(',')]);

  function reset() {
    save({}); setSaved({});
    setHeaderRow(0);
    const fresh = datasets.length >= 2 ? defaultSettings(datasets, {}) : null;
    const settings: Form = fresh ? { keys: fresh.keys, cmp: fresh.cmp, pivotCol: fresh.pivotCol, tol: 0, ignoreCase: true, aggregate: true } : EMPTY_FORM;
    setForm(settings);
    if (fresh) run(settings, 0);
  }

  const toggle = (field: 'keys' | 'cmp') => (column: string, on: boolean) => setForm((current) => ({ ...current, [field]: on ? [...current[field], column] : current[field].filter((value) => value !== column) }));
  const manageLink = canManage ? <> ผู้ดูแลอัปโหลดไฟล์รายงานโอนเงินได้ที่หน้า <Link href="/money/nhso/files">จัดการไฟล์</Link></> : ' ติดต่อผู้ดูแล Smart Money เพื่ออัปโหลดไฟล์';
  const duplicates = datasets.filter((dataset) => dataset.name.endsWith(' *'));
  const unbalanced = datasets.filter((dataset) => dataset.badGroups);

  return <section className="nhso">
    <h2>เงินโอน สปสช. รายกองทุน เทียบรายโรงพยาบาล</h2>
    <div className="nhso-bar">
      <span className="money-note" role="status">{status}</span>
      <div className="nhso-bar-actions">
        <button type="button" onClick={() => void load()} disabled={loading}>โหลดข้อมูลล่าสุด</button>
        {canManage && <Link className="button-secondary" href="/money/nhso/files">จัดการไฟล์ (ผู้ดูแล)</Link>}
      </div>
    </div>

    {stored === null ? <p className="money-empty">{failed ? 'โหลดข้อมูลไม่สำเร็จ กดปุ่ม "โหลดข้อมูลล่าสุด" เพื่อลองใหม่' : 'กำลังโหลดข้อมูล...'}</p>
      : stored.length === 0 ? <p className="money-empty">ยังไม่มีข้อมูล{manageLink}</p>
        : datasets.length < 2 ? <p className="money-empty">มีข้อมูลโรงพยาบาลเดียว ต้องมีอย่างน้อย 2 โรงพยาบาลจึงจะเทียบได้{manageLink}</p>
          : <>
            {dash && <NhsoOverview datasets={datasets} dash={dash} />}
            {compare && report && <NhsoDetails datasets={datasets} dash={dash} funds={fundSheet?.funds ?? []} stats={compare.stats} report={report}
              yearChoice={yearChoice} setYearChoice={(choice) => { setYearHospital(choice.hospital); setYearMetric(choice.metric); }} toggleYear={toggleYearYear} allYears={allYears}
              onExport={() => void import('../../../../lib/money/nhso-export').then((module) => module.downloadNhsoReport(report))} />}
          </>}

    {stored !== null && stored.length > 0 && <details className="money-card nhso-settings">
      <summary>ข้อมูลไฟล์และการตั้งค่าการเทียบ</summary>
      <h3>1. ข้อมูลในระบบ</h3>
      <p className="money-note">ผู้ดูแลอัปโหลดไฟล์รายงานโอนเงินจาก สปสช. ได้ที่หน้าจัดการไฟล์ ทุกคนเห็นข้อมูลชุดเดียวกัน ค่าตั้งด้านล่างจำไว้ในเบราว์เซอร์ของเครื่องนี้เท่านั้น</p>
      <span className="nhso-field"><label htmlFor={`${ids}-header`}>แถวหัวตาราง (0 = อัตโนมัติ)</label>
        <input id={`${ids}-header`} type="number" min={0} value={headerRow} onChange={(event) => setHeaderRow(Math.max(0, Number(event.target.value) || 0))} /></span>
      <p className="money-note">ข้อมูล {stored.length} ไฟล์ ({datasets.length} โรงพยาบาล): {datasets.map((dataset) => `${dataset.name} (${dataset.rows.length} แถว${dataset.fys.size ? `, ปีงบ ${[...dataset.fys].sort().join('/')}` : ''})`).join(' · ')}{datasets.length === 1 ? ' — ต้องมีอย่างน้อย 2 โรงพยาบาลจึงจะเทียบได้' : ''}</p>
      {(duplicates.length > 0 || unbalanced.length > 0) && <ul className="nhso-warnings">
        {duplicates.map((dataset) => <li key={dataset.name}>⚠ ไฟล์ {dataset.file} เป็นโรงพยาบาลเดียวกับไฟล์อื่น ({dataset.name.replace(/( \*)+$/, '')}) อาจนำเข้าซ้ำ ตรวจสอบว่าเลือกไฟล์ถูกหรือไม่</li>)}
        {unbalanced.map((dataset) => <li key={`bad-${dataset.name}`}>⚠ {dataset.name}: มี {dataset.badGroups} รายการโอนที่ผลรวมคงเหลือไม่เท่ากับเงินโอนเข้าบัญชี จึงแบ่งยอดตามกองทุนไม่ได้ (ใช้ตัวเลขตามไฟล์เดิม)</li>)}
      </ul>}
      {defaults && <>
        <h3>2. ตั้งค่าการเทียบ</h3>
        <Chips label="คอลัมน์ key ใช้จับคู่แถวระหว่างไฟล์ (เช่น เลขที่รายการ, เลขอ้างอิงการโอน)" options={defaults.common} selected={form.keys} onToggle={toggle('keys')} />
        <Chips label="คอลัมน์ที่จะเทียบค่า (เช่น จำนวนเงิน, วันที่, ชื่อผู้รับ)" options={defaults.common} selected={form.cmp} onToggle={toggle('cmp')} />
        <div className="nhso-toolbar">
          <span className="nhso-field"><label htmlFor={`${ids}-tol`}>ยอมให้ตัวเลขต่างกันได้ไม่เกิน</label><input id={`${ids}-tol`} type="number" step="0.01" min={0} value={form.tol} onChange={(event) => setForm({ ...form, tol: Number(event.target.value) || 0 })} /></span>
          <label><input type="checkbox" checked={form.ignoreCase} onChange={(event) => setForm({ ...form, ignoreCase: event.target.checked })} /> ไม่สนตัวพิมพ์เล็ก/ใหญ่</label>
          <label><input type="checkbox" checked={form.aggregate} onChange={(event) => setForm({ ...form, aggregate: event.target.checked })} /> key ซ้ำในไฟล์เดียวกันให้รวมยอด</label>
          <span className="nhso-field"><label htmlFor={`${ids}-pivot`}>ตารางเทียบยอดใช้คอลัมน์</label><select id={`${ids}-pivot`} value={form.pivotCol} onChange={(event) => setForm({ ...form, pivotCol: event.target.value })}>{defaults.numeric.map((column) => <option key={column}>{column}</option>)}</select></span>
          <button type="button" onClick={() => run(form, headerRow)}>เริ่มเทียบข้อมูล</button>
          <button type="button" className="button-secondary" onClick={reset}>คืนค่าเริ่มต้น</button>
        </div>
        {(setupError || !defaults.common.length) && <p className="money-alert" role="alert">{setupError || 'ไม่พบคอลัมน์ที่ชื่อตรงกันในทุกไฟล์ ลองเปลี่ยนแถวหัวตารางหรือตรวจชื่อคอลัมน์'}</p>}
      </>}
    </details>}
  </section>;
}
