'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThaiDateInput } from '../../../../components/thai-date-input';
import { endFollowingStart } from '../../../../lib/date-range';

/** ตั้งแต่วันที่ / ถึงวันที่: picking the start moves the end to the same day unless the end is still on or after it (DESIGN.md). */
export function DentalDateFilter({ start, end, group, period }: { start: string; end: string; group: string; period: string }) {
  const router = useRouter();
  const ids = useId();
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  return <form className="money-date-filter" aria-label="ช่วงวันที่" onSubmit={(event) => { event.preventDefault(); router.push(`/money/dental?${new URLSearchParams({ start: from, end: to, group, period }).toString()}`); }}>
    <label htmlFor={`${ids}-from`}>ตั้งแต่วันที่</label>
    <ThaiDateInput id={`${ids}-from`} value={from} required onChange={(value) => { setFrom(value); setTo((current) => endFollowingStart(value, current)); }} />
    <label htmlFor={`${ids}-to`}>ถึงวันที่</label>
    <ThaiDateInput id={`${ids}-to`} value={to} min={from} required onChange={setTo} />
    <button type="submit" disabled={!from || !to || to < from}>แสดงข้อมูล</button>
  </form>;
}
