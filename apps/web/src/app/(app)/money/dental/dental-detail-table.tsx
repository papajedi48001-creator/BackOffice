'use client';

import { useId, useMemo, useState } from 'react';
import { NO_PACCOUNT } from '@backoffice/contracts';
import type { DentalRow } from '@backoffice/core';
import { formatBangkokDateOnly } from '../../../../lib/bangkok-time';
import { formatMoney } from './dental-format';

const paccountOf = (row: DentalRow) => (row.paccountName ?? '').trim() || NO_PACCOUNT;
const byThai = (a: string, b: string) => a.localeCompare(b, 'th');

/**
 * รายละเอียดรายการ with ทุกสิทธิ / ทุกผังบัญชี filters and a search box, all in the browser (nothing leaves the page). While any
 * filter is on, a line shows what is left: rows, visits and ลูกหนี้ counted once per visit, as the legacy page did.
 */
export function DentalDetailTable({ rows }: { rows: readonly DentalRow[] }) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [pttype, setPttype] = useState('');
  const [paccount, setPaccount] = useState('');
  const pttypes = useMemo(() => [...new Map(rows.map((row) => [row.pttypeCode, `${row.pttypeCode} ${row.pttypeName}`.trim()])).entries()].sort(([, a], [, b]) => byThai(a, b)), [rows]);
  const paccounts = useMemo(() => [...new Set(rows.map(paccountOf))].sort(byThai), [rows]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return rows.filter((row) => (!pttype || row.pttypeCode === pttype) && (!paccount || paccountOf(row) === paccount)
      && (!words || [formatBangkokDateOnly(row.vstdate), row.hn, row.patientName, row.diagCode, row.diagName, row.doctorName, row.pttypeCode, row.pttypeName, row.paccountName ?? ''].join(' ').toLowerCase().includes(words)));
  }, [rows, query, pttype, paccount]);
  const filtered = Boolean(query.trim() || pttype || paccount);
  const visits = new Map(shown.map((row) => [row.vn, row.claimAmount]));
  const claim = [...visits.values()].reduce((total, value) => total + Number(value), 0);
  return <>
    <div className="money-card-head">
      <h3>รายละเอียดรายการ ({rows.length.toLocaleString('th-TH')} แถว)</h3>
      <div className="money-table-filters">
        <label className="visually-hidden" htmlFor={`${ids}-pttype`}>กรองตามสิทธิ</label>
        <select id={`${ids}-pttype`} value={pttype} onChange={(event) => setPttype(event.target.value)}><option value="">ทุกสิทธิ</option>{pttypes.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
        <label className="visually-hidden" htmlFor={`${ids}-paccount`}>กรองตามผังบัญชี</label>
        <select id={`${ids}-paccount`} value={paccount} onChange={(event) => setPaccount(event.target.value)}><option value="">ทุกผังบัญชี</option>{paccounts.map((name) => <option key={name} value={name}>{name}</option>)}</select>
        <input type="search" className="money-search" aria-label="ค้นหารายการ" placeholder="ค้นหา HN / ชื่อ / Diag หลัก / ทันตแพทย์ / สิทธิ / ผังบัญชี" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
    </div>
    {filtered && <p className="money-note" role="status">{`แสดง ${shown.length.toLocaleString('th-TH')} แถว · ${visits.size.toLocaleString('th-TH')} visit · ลูกหนี้ ${formatMoney(claim)} บาท`}</p>}
    <div className="money-table-wrap is-tall"><table aria-label="รายละเอียดรายการ">
      <thead><tr><th>วันที่</th><th>HN</th><th>ชื่อ-สกุล</th><th>Diag หลัก</th><th>ชื่อโรค</th><th>ทันตแพทย์</th><th>สิทธิ</th><th>ผังบัญชี</th><th className="money-number">ค่ารักษารวม</th><th className="money-number">ชำระแล้ว</th><th className="money-number">ลูกหนี้</th></tr></thead>
      <tbody>{shown.map((row, index) => <tr key={`${row.vn}-${row.diagCode}-${index}`}>
        <td className="money-nowrap">{formatBangkokDateOnly(row.vstdate)}</td><td>{row.hn}</td><td>{row.patientName}</td><td>{row.diagCode && <span className="money-code">{row.diagCode}</span>}</td><td>{row.diagName}</td><td>{row.doctorName}</td>
        <td>{row.pttypeCode} {row.pttypeName}</td><td>{row.paccountName ?? ''}</td>
        <td className="money-number">{formatMoney(row.totalAmount)}</td><td className="money-number">{formatMoney(row.paidMoney)}</td><td className="money-number">{formatMoney(row.claimAmount)}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}
