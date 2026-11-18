'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MappingHistoryRow, SideChange } from '@backoffice/core';
import { SearchCard } from '../../../../components/search-card';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { bangkokToday, formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { endFollowingStart } from '../../../../lib/date-range';

const change = (side: SideChange | null) => (side ? `${side.from ?? 'ยังไม่ผูก'} → ${side.to ?? 'ยังไม่ผูก'}` : '—');

/**
 * ประวัติการแก้ไข: who changed which สิทธิ, when (Bangkok time), and each side's old → new code. The date range also goes
 * into the address so the server reads that range, not just the latest `limit` changes.
 */
export function HistoryTable({ rows, from: initialFrom = '', to: initialTo = '', limit = 200 }: { rows: readonly MappingHistoryRow[]; from?: string; to?: string; limit?: number }) {
  const ids = useId();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [from, setFromState] = useState(initialFrom);
  const [to, setToState] = useState(initialTo);
  const load = (start: string, end: string) => {
    const params = new URLSearchParams(Object.entries({ from: start, to: end }).filter(([, value]) => value !== ''));
    router.replace(`/pttype-mapping/history${params.size ? `?${params.toString()}` : ''}`, { scroll: false });
  };
  const setFrom = (value: string) => { const end = to ? endFollowingStart(value, to) : to; setFromState(value); setToState(end); load(value, end); };
  const setTo = (value: string) => { setToState(value); load(from, value); };
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((row) => {
    const day = bangkokToday(new Date(row.at));
    return (!needle || row.pttype.toLowerCase().includes(needle) || (row.actorName ?? '').toLowerCase().includes(needle)) && (!from || day >= from) && (!to || day <= to);
  });
  return <>
    <div className="page-heading"><h2>ประวัติการแก้ไข</h2></div>
    <SearchCard query={query} onQuery={setQuery} label="ค้นหา" placeholder="รหัสสิทธิ หรือชื่อผู้แก้" shown={shown.length} total={rows.length} unit="รายการ"
      filtered={query !== '' || from !== '' || to !== ''} onClear={() => { setQuery(''); setFromState(''); setToState(''); load('', ''); }}>
      <label htmlFor={`${ids}-from`}>ตั้งแต่วันที่<ThaiDateInput id={`${ids}-from`} value={from} onChange={setFrom} /></label>
      <label htmlFor={`${ids}-to`}>ถึงวันที่<ThaiDateInput id={`${ids}-to`} value={to} min={from || undefined} onChange={setTo} /></label>
    </SearchCard>
    {rows.length >= limit && <p className="form-hint">แสดงเฉพาะ {limit} รายการล่าสุด{initialFrom || initialTo ? 'ในช่วงวันที่นี้' : ''} เลือกช่วงวันที่ให้แคบลงเพื่อดูรายการที่เก่ากว่า</p>}
    {shown.length === 0 ? <p>ยังไม่มีประวัติการแก้ไขที่ตรงกับการค้นหา</p> : <table className="mapping-history">
      <thead><tr><th>วันเวลา</th><th>ผู้แก้</th><th>สิทธิ</th><th>ผังบัญชี OPD เดิม → ใหม่</th><th>ผังบัญชี IPD เดิม → ใหม่</th></tr></thead>
      <tbody>{shown.map((row) => <tr key={row.id}>
        <td>{formatBangkokDateTime(row.at)}</td><td>{row.actorName ?? '—'}</td><td className="mapping-code">{row.pttype}</td><td>{change(row.opd)}</td><td>{change(row.ipd)}</td>
      </tr>)}</tbody>
    </table>}
  </>;
}
