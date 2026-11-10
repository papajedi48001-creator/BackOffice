'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThaiDateInput } from '../../../../../components/thai-date-input';
import { endFollowingStart } from '../../../../../lib/date-range';

/** The บัญชีวัสดุ date range. Picking the start moves the end to the same day unless the end is still on or after it (DESIGN.md). */
export function LedgerRange({ path, store, from, to }: { path: string; store: string; from: string; to: string }) {
  const router = useRouter();
  const ids = useId();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  return <form className="lab-filter" onSubmit={(event) => { event.preventDefault(); router.push(`${path}?${new URLSearchParams({ store, from: start, to: end }).toString()}`); }}>
    <label htmlFor={`${ids}-from`}>ตั้งแต่</label>
    <ThaiDateInput id={`${ids}-from`} value={start} required onChange={(value) => { setStart(value); setEnd((current) => endFollowingStart(value, current)); }} />
    <label htmlFor={`${ids}-to`}>ถึง</label>
    <ThaiDateInput id={`${ids}-to`} value={end} min={start} required onChange={setEnd} />
    <button type="submit" disabled={!start || !end || end < start}>แสดง</button>
  </form>;
}
