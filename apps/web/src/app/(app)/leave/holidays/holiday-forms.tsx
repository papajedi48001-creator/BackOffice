'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { formatBangkokDate } from '../../../../lib/bangkok-time';
import { leaveErrorMessage } from '../../../../lib/leave-labels';

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return response.ok ? null : leaveErrorMessage(((await response.json()) as { error?: string }).error);
  } catch { return leaveErrorMessage(null); }
}

export function HolidayAddForm({ year }: { year: number }) {
  const router = useRouter();
  const [form, setForm] = useState({ date: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const failure = await send('/api/leave/holidays', 'POST', { date: form.date, name: form.name.trim() });
    setError(failure);
    if (!failure) { setForm({ date: '', name: '' }); router.refresh(); }
  }
  return <form aria-label={t('leaveAddHoliday')} className="reason-form" onSubmit={submit}>
    <div className="form-row">
      <div className="form-field"><label htmlFor="holiday-date">{t('leaveHolidayDate')}</label><input id="holiday-date" type="date" min={`${year}-01-01`} max={`${year}-12-31`} required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="holiday-name">{t('leaveHolidayName')}</label><input id="holiday-name" maxLength={120} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button type="submit">{t('leaveAddHoliday')}</button></div>
  </form>;
}

export function HolidayRow({ holiday }: { holiday: { date: string; name: string } }) {
  const router = useRouter();
  const [name, setName] = useState(holiday.name);
  const [error, setError] = useState<string | null>(null);
  async function act(method: 'PUT' | 'DELETE') {
    const failure = await send(`/api/leave/holidays/${holiday.date}`, method, method === 'PUT' ? { name: name.trim() } : undefined);
    setError(failure);
    if (!failure) router.refresh();
  }
  return <tr>
    <td>{formatBangkokDate(holiday.date)}</td>
    <td><input aria-label={`${t('leaveHolidayName')} ${formatBangkokDate(holiday.date)}`} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />{error && <p role="alert" className="form-error">{error}</p>}</td>
    <td><div className="row-actions"><button type="button" onClick={() => void act('PUT')}>{t('leaveRenameHoliday')}</button><button type="button" className="button-danger" onClick={() => void act('DELETE')}>{t('leaveDeleteHoliday')}</button></div></td>
  </tr>;
}
