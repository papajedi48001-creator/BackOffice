'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
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
    if (failure) return false;
    setForm({ date: '', name: '' });
    router.refresh();
    return true;
  }
  return <div className="form-actions">
    <FormDialog title={t('leaveAddHoliday')} triggerLabel={t('leaveAddHoliday')} submitLabel={t('leaveAddHoliday')} error={error} onOpenChange={(open) => { if (open) setError(null); }} onSubmit={submit}>
      <div className="form-field"><label htmlFor="holiday-date">{t('leaveHolidayDate')}</label><input id="holiday-date" type="date" min={`${year}-01-01`} max={`${year}-12-31`} required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div>
      <div className="form-field"><label htmlFor="holiday-name">{t('leaveHolidayName')}</label><input id="holiday-name" maxLength={120} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
    </FormDialog>
  </div>;
}

export function HolidayRow({ holiday }: { holiday: { date: string; name: string } }) {
  const router = useRouter();
  const [name, setName] = useState(holiday.name);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const date = formatBangkokDate(holiday.date);
  async function act(method: 'PUT' | 'DELETE') {
    setBusy(true);
    const failure = await send(`/api/leave/holidays/${holiday.date}`, method, method === 'PUT' ? { name: name.trim() } : undefined);
    setBusy(false);
    setError(failure);
    if (!failure) router.refresh();
    return !failure;
  }
  const open = (next: 'rename' | 'delete' | null) => { setError(null); setDialog(next); };
  return <tr>
    <td>{date}</td>
    <td>{holiday.name}</td>
    <td><div className="row-actions">
      <FormDialog title={`${t('leaveEditHolidayName')} ${date}`} triggerLabel={t('leaveEditHolidayName')} triggerAriaLabel={`${t('leaveEditHolidayName')} ${date}`} triggerClassName="button-secondary" submitLabel={t('leaveRenameHoliday')}
        open={dialog === 'rename'} onOpenChange={(next) => (next ? open('rename') : setDialog(null))} isSubmitting={busy} error={error} onSubmit={(event) => { event.preventDefault(); return act('PUT'); }}>
        <div className="form-field"><label htmlFor={`holiday-name-${holiday.date}`}>{t('leaveHolidayName')}</label><input id={`holiday-name-${holiday.date}`} value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></div>
      </FormDialog>
      <button type="button" className="button-danger" aria-label={`${t('leaveDeleteHoliday')} ${date}`} onClick={() => open('delete')}>{t('leaveDeleteHoliday')}</button>
    </div>
    {dialog === 'delete' && <ActionDialog title={`${t('leaveDeleteHoliday')} ${holiday.name}`} message={`${t('dialogConfirmQuestion')} ${date}`} confirmLabel={t('leaveDeleteHoliday')} tone="danger" isSubmitting={busy} error={error}
      onConfirm={() => void act('DELETE').then((done) => { if (done) setDialog(null); })} onClose={() => setDialog(null)} />}</td>
  </tr>;
}
