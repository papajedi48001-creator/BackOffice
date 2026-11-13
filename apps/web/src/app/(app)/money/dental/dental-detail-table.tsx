'use client';

import { useMemo, useState } from 'react';
import type { DentalRow } from '@backoffice/core';
import { formatBangkokDateOnly } from '../../../../lib/bangkok-time';
import { formatMoney } from './dental-format';

/** รายละเอียดรายการ with a search box that filters in the browser; the search text never leaves the page. */
export function DentalDetailTable({ rows }: { rows: readonly DentalRow[] }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    if (!words) return rows;
    return rows.filter((row) => [row.hn, row.patientName, row.diagCode, row.diagName, row.pttypeCode, row.pttypeName, row.paccountName ?? ''].join(' ').toLowerCase().includes(words));
  }, [rows, query]);
  return <>
    <div className="money-card-head">
      <h3>รายละเอียดรายการ ({formatMoneyCount(shown.length)} แถว)</h3>
      <input type="search" className="money-search" aria-label="ค้นหารายการ" placeholder="ค้นหา HN / ชื่อ / รหัสโรค / สิทธิ / ผังบัญชี" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <div className="money-table-wrap is-tall"><table aria-label="รายละเอียดรายการ">
      <thead><tr><th>วันที่</th><th>HN</th><th>ชื่อ-สกุล</th><th>ICD-10</th><th>ชื่อโรค</th><th>สิทธิ</th><th>ผังบัญชี</th><th className="money-number">ค่ารักษารวม</th><th className="money-number">ชำระแล้ว</th><th className="money-number">ลูกหนี้</th></tr></thead>
      <tbody>{shown.map((row, index) => <tr key={`${row.vn}-${row.diagCode}-${index}`}>
        <td className="money-nowrap">{formatBangkokDateOnly(row.vstdate)}</td><td>{row.hn}</td><td>{row.patientName}</td><td><span className="money-code">{row.diagCode}</span></td><td>{row.diagName}</td>
        <td>{row.pttypeCode} {row.pttypeName}</td><td>{row.paccountName ?? ''}</td>
        <td className="money-number">{formatMoney(row.totalAmount)}</td><td className="money-number">{formatMoney(row.paidMoney)}</td><td className="money-number">{formatMoney(row.claimAmount)}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

const formatMoneyCount = (value: number) => value.toLocaleString('th-TH');
