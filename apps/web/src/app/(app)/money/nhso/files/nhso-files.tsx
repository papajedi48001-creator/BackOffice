'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { NhsoDatasetSummary } from '@backoffice/core';
import { ActionDialog } from '../../../../../components/action-dialog';
import { bangkokToday, formatBangkokDateOnly, formatBangkokTime } from '../../../../../lib/bangkok-time';
import { moneyErrorMessage } from '../../../../../lib/money-client';
import { formatMoney } from '../../dental/dental-format';

const thaiDate = (date: string | null) => (date ? formatBangkokDateOnly(date) : '-');
const uploadedAt = (instant: string) => `${formatBangkokDateOnly(bangkokToday(new Date(instant)))} ${formatBangkokTime(instant)}`;

type Pending = { kind: 'one'; dataset: NhsoDatasetSummary } | { kind: 'all' };

/** ข้อมูลในระบบ: the stored reports with ลบ and ลบข้อมูลทั้งหมด, each confirmed in a dialog, as on the legacy upload page. */
export function NhsoFiles({ datasets }: { datasets: readonly NhsoDatasetSummary[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function confirm() {
    if (!pending) return;
    setBusy(true); setError(null);
    const url = pending.kind === 'all' ? '/api/money/nhso/datasets' : `/api/money/nhso/datasets/${pending.dataset.hcode}/${pending.dataset.fy}`;
    try {
      const response = await fetch(url, { method: 'DELETE' });
      const body = (await response.json().catch(() => ({}))) as { error?: string; removed?: number };
      if (!response.ok) { setError(moneyErrorMessage(body.error ?? null)); return; }
      setNotice(pending.kind === 'all'
        ? (body.removed ? `ลบข้อมูลทั้งหมดแล้ว (${body.removed.toLocaleString('en-US')} ไฟล์)` : 'ไม่มีข้อมูลให้ลบ')
        : `ลบข้อมูล ${pending.dataset.hcode} ${pending.dataset.name} ปีงบ ${pending.dataset.fy} แล้ว`);
      setPending(null);
      router.refresh();
    } catch { setError(moneyErrorMessage(null)); } finally { setBusy(false); }
  }

  return <section className="money-card nhso-files" aria-labelledby="nhso-files-title">
    <div className="money-card-head">
      <h3 id="nhso-files-title">ข้อมูลในระบบ ({datasets.length.toLocaleString('en-US')} ไฟล์)</h3>
      {datasets.length > 0 && <button type="button" className="button-danger" onClick={() => { setError(null); setPending({ kind: 'all' }); }}>ลบข้อมูลทั้งหมด</button>}
    </div>
    <p className="money-note" role="status">{notice}</p>
    {datasets.length === 0 ? <p className="money-empty">ยังไม่มีข้อมูล</p> : <div className="money-table-wrap"><table aria-label="ข้อมูลในระบบ">
      <thead><tr><th>ปีงบ</th><th>รหัส</th><th>หน่วยบริการ</th><th>ช่วงวันที่โอน</th><th className="money-number">แถว</th><th className="money-number">เงินโอนเข้าบัญชี</th><th>ไฟล์</th><th>อัปโหลดเมื่อ</th><th></th></tr></thead>
      <tbody>{datasets.map((dataset) => <tr key={`${dataset.hcode}-${dataset.fy}`}>
        <td>{dataset.fy}</td><td>{dataset.hcode}</td><td>{dataset.name}</td>
        <td className="money-nowrap">{`${thaiDate(dataset.dateFrom)} – ${thaiDate(dataset.dateTo)}`}</td>
        <td className="money-number">{dataset.rowCount.toLocaleString('en-US')}</td><td className="money-number">{formatMoney(dataset.transferTotal)}</td>
        <td>{dataset.fileName}</td><td className="money-nowrap">{uploadedAt(dataset.uploadedAt)}</td>
        <td><button type="button" className="button-danger" aria-label={`ลบ ${dataset.hcode} ${dataset.name} ปีงบ ${dataset.fy}`} onClick={() => { setError(null); setPending({ kind: 'one', dataset }); }}>ลบ</button></td>
      </tr>)}</tbody>
    </table></div>}
    {pending && <ActionDialog tone="danger" isSubmitting={busy} error={error} onClose={() => setPending(null)} onConfirm={() => void confirm()}
      {...(pending.kind === 'all'
        ? { title: 'ลบข้อมูลทั้งหมด', message: `ลบข้อมูลเงินโอนทั้งหมด ${datasets.length.toLocaleString('en-US')} ไฟล์? ลบแล้วกู้คืนไม่ได้ ต้องอัปโหลดใหม่`, confirmLabel: 'ลบทั้งหมด' }
        : { title: 'ลบข้อมูล', message: `ลบข้อมูล ${pending.dataset.hcode} ${pending.dataset.name} ปีงบ ${pending.dataset.fy} ?`, confirmLabel: 'ลบ' })} />}
  </section>;
}
