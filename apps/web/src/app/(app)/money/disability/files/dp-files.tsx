'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DpYearSummary } from '@backoffice/core';
import { ActionDialog } from '../../../../../components/action-dialog';
import { bangkokToday, formatBangkokDateOnly, formatBangkokTime } from '../../../../../lib/bangkok-time';
import { moneyErrorMessage } from '../../../../../lib/money-client';
import { formatMoney } from '../../dental/dental-format';

const updatedAt = (instant: string) => `${formatBangkokDateOnly(bangkokToday(new Date(instant)))} ${formatBangkokTime(instant)}`;
const count = (n: number) => n.toLocaleString('en-US');

/** ข้อมูลที่นำเข้าแล้ว: one row per ปีงบ with ลบ (the whole ปีงบ) confirmed in a dialog, as on the legacy upload page. */
export function DpFiles({ years }: { years: readonly DpYearSummary[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  async function confirm() {
    if (pending === null) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/money/disability/records', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fy: pending }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; records?: number };
      if (!response.ok) { setError(response.status === 404 ? 'ไม่พบข้อมูลที่จะลบ' : moneyErrorMessage(body.error ?? null)); return; }
      setNotice(`ลบข้อมูลปีงบ ${pending} แล้ว (${count(body.records ?? 0)} ครั้ง)`);
      setPending(null);
      router.refresh();
    } catch { setError(moneyErrorMessage(null)); } finally { setBusy(false); }
  }

  return <>
    <p className="money-note" role="status">{notice}</p>
    <section className="money-card nhso-files" aria-labelledby="dp-years-title">
      <h3 id="dp-years-title">{`ข้อมูลที่นำเข้าแล้ว (${count(years.length)} ปีงบ · ${count(years.reduce((total, year) => total + year.count, 0))} ครั้ง)`}</h3>
      {years.length === 0 ? <p className="money-empty">ยังไม่มีข้อมูล</p> : <>
        <div className="money-table-wrap"><table aria-label="ข้อมูลที่นำเข้าแล้ว">
          <thead><tr><th>ปีงบ</th><th>วันที่รับบริการ</th><th className="money-number">ครั้ง</th><th className="money-number">ขอเบิก</th><th className="money-number">พึงเบิก</th>
            <th className="money-number">ติดสถานะ</th><th>ไฟล์ล่าสุด</th><th>ปรับปรุงเมื่อ</th><th></th></tr></thead>
          <tbody>{years.map((year) => <tr key={year.fy}>
            <td><b>{year.fy}</b></td>
            <td className="money-nowrap">{`${formatBangkokDateOnly(year.from)} – ${formatBangkokDateOnly(year.to)}`}</td>
            <td className="money-number">{count(year.count)}</td><td className="money-number">{formatMoney(year.claim)}</td><td className="money-number">{formatMoney(year.eligible)}</td>
            <td className="money-number">{count(year.flagged)}</td><td>{year.latestFile ?? ''}</td>
            <td className="money-nowrap">{updatedAt(year.updatedAt)}</td>
            <td><button type="button" className="button-danger" aria-label={`ลบข้อมูลปีงบ ${year.fy}`} onClick={() => { setError(null); setPending(year.fy); }}>ลบ</button></td>
          </tr>)}</tbody>
        </table></div>
        <p className="money-note">พึงเบิก (AF) ในตารางนี้เป็นยอดตามไฟล์ทุกแถว ส่วนหน้า dashboard ไม่รวมแถวที่ติดสถานะ</p>
      </>}
    </section>
    {pending !== null && <ActionDialog tone="danger" isSubmitting={busy} error={error} onClose={() => setPending(null)} onConfirm={() => void confirm()}
      title="ลบข้อมูล" message={`ลบข้อมูลปีงบ ${pending} ทั้งหมด?`} confirmLabel="ลบ" />}
  </>;
}
