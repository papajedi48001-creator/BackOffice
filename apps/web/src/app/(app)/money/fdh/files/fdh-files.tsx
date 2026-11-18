'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FdhDocumentSummary } from '@backoffice/core';
import { ActionDialog } from '../../../../../components/action-dialog';
import { bangkokToday, formatBangkokDateOnly, formatBangkokTime } from '../../../../../lib/bangkok-time';
import { moneyErrorMessage } from '../../../../../lib/money-client';
import { formatMoney } from '../../dental/dental-format';

type Kind = 'rep' | 'stm';
type Pending = { kind: Kind; document: FdhDocumentSummary | null };
const thaiDate = (date: string | null) => (date ? formatBangkokDateOnly(date) : '-');
const uploadedAt = (instant: string) => `${formatBangkokDateOnly(bangkokToday(new Date(instant)))} ${formatBangkokTime(instant)}`;
const count = (n: number) => n.toLocaleString('en-US');
const LABEL: Record<Kind, string> = { rep: 'REP', stm: 'STM' };

/** ไฟล์ STM and ไฟล์ REP with ลบ and ลบทั้งหมด, each confirmed in a dialog, as on the legacy upload page. */
export function FdhFiles({ reps, stms }: { reps: readonly FdhDocumentSummary[]; stms: readonly FdhDocumentSummary[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const listOf = (kind: Kind) => (kind === 'rep' ? reps : stms);

  async function confirm() {
    if (!pending) return;
    setBusy(true); setError(null);
    const target = pending.document ? { kind: pending.kind, docNo: pending.document.docNo } : { kind: pending.kind };
    try {
      // เลขที่เอกสาร goes in the body, never in the URL (it would reach access logs).
      const response = await fetch('/api/money/fdh/documents', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(target) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; removed?: number };
      if (!response.ok) { setError(response.status === 404 ? 'ไม่พบข้อมูลที่จะลบ' : moneyErrorMessage(body.error ?? null)); return; }
      setNotice(pending.document ? 'ลบข้อมูลแล้ว' : body.removed ? `ลบไฟล์ ${LABEL[pending.kind]} ทั้งหมดแล้ว (${count(body.removed)} ไฟล์)` : 'ไม่มีข้อมูลให้ลบ');
      setPending(null);
      router.refresh();
    } catch { setError(moneyErrorMessage(null)); } finally { setBusy(false); }
  }

  const head = (kind: Kind, title: string) => <div className="money-card-head">
    <h3 id={`fdh-${kind}-title`}>{title}</h3>
    {listOf(kind).length > 0 && <button type="button" className="button-danger" onClick={() => { setError(null); setPending({ kind, document: null }); }}>{`ลบ ${LABEL[kind]} ทั้งหมด`}</button>}
  </div>;
  const remove = (document: FdhDocumentSummary) => <button type="button" className="button-danger" aria-label={`ลบ ${LABEL[document.kind]} ${document.docNo}`} onClick={() => { setError(null); setPending({ kind: document.kind, document }); }}>ลบ</button>;

  return <>
    <p className="money-note" role="status">{notice}</p>
    <section className="money-card nhso-files" aria-labelledby="fdh-stm-title">
      {head('stm', `ไฟล์ STM (${count(stms.length)} งวด)`)}
      {stms.length === 0 ? <p className="money-empty">ยังไม่มีไฟล์ STM</p> : <div className="money-table-wrap"><table aria-label="ไฟล์ STM">
        <thead><tr><th>งวด</th><th>เลขที่เอกสาร</th><th className="money-number">แถว</th><th className="money-number">ยอดชดเชยทั้งสิ้น</th><th>ออกรายงาน</th><th>อัปโหลดเมื่อ</th><th></th></tr></thead>
        <tbody>{stms.map((document) => <tr key={document.docNo}>
          <td>{document.period}</td><td>{document.docNo}</td><td className="money-number">{count(document.count)}</td><td className="money-number">{formatMoney(document.sum)}</td>
          <td className="money-nowrap">{thaiDate(document.reportDate)}</td><td className="money-nowrap">{uploadedAt(document.uploadedAt)}</td><td>{remove(document)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section className="money-card nhso-files" aria-labelledby="fdh-rep-title">
      {head('rep', `ไฟล์ REP (${count(reps.length)} ไฟล์ · ${count(reps.reduce((total, document) => total + document.count, 0))} เคส)`)}
      {reps.length === 0 ? <p className="money-empty">ยังไม่มีไฟล์ REP</p> : <div className="money-table-wrap"><table aria-label="ไฟล์ REP">
        <thead><tr><th>เลขที่เอกสาร</th><th className="money-number">เคส</th><th className="money-number">ชดเชยสุทธิ</th><th>ออกรายงาน</th><th>อัปโหลดเมื่อ</th><th></th></tr></thead>
        <tbody>{reps.map((document) => <tr key={document.docNo}>
          <td>{document.docNo}</td><td className="money-number">{count(document.count)}</td><td className="money-number">{formatMoney(document.sum)}</td>
          <td className="money-nowrap">{thaiDate(document.reportDate)}</td><td className="money-nowrap">{uploadedAt(document.uploadedAt)}</td><td>{remove(document)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    {pending && <ActionDialog tone="danger" isSubmitting={busy} error={error} onClose={() => setPending(null)} onConfirm={() => void confirm()}
      {...(pending.document
        ? { title: 'ลบข้อมูล', message: `ลบ ${LABEL[pending.kind]} ${pending.document.docNo} ?`, confirmLabel: 'ลบ' }
        : { title: `ลบ ${LABEL[pending.kind]} ทั้งหมด`, message: `ลบไฟล์ ${LABEL[pending.kind]} ทั้งหมด ${count(listOf(pending.kind).length)} ไฟล์? ลบแล้วกู้คืนไม่ได้ ต้องอัปโหลดใหม่`, confirmLabel: 'ลบทั้งหมด' })} />}
  </>;
}
