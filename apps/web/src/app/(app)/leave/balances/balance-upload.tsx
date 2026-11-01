'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { FormDialog } from '../../../../components/form-dialog';
import { leaveErrorMessage } from '../../../../lib/leave-labels';

type RowError = { row: number; column: string; code: string };

/** Uploads HR's edited balance file; nothing is stored unless every row is valid. */
export function BalanceUploadForm({ fiscalYear }: { fiscalYear: number }) {
  const router = useRouter();
  const [year, setYear] = useState(String(fiscalYear));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  async function submit(event: React.FormEvent): Promise<boolean> {
    event.preventDefault();
    if (!file) return false;
    setBusy(true); setErrors([]); setMessage(null);
    const form = new FormData();
    form.set('fiscalYear', year);
    form.set('file', file);
    try {
      const response = await fetch('/api/leave/balances', { method: 'POST', body: form });
      const result = (await response.json()) as { ok?: boolean; rowsChanged?: number; errors?: RowError[]; error?: string };
      if (response.ok && result.ok) { setDone(`${t('leaveImportDone')} ${result.rowsChanged}`); setFile(null); router.refresh(); return true; }
      if (result.errors) setErrors(result.errors);
      else setMessage(leaveErrorMessage(result.error));
    } catch { setMessage(leaveErrorMessage(null)); } finally { setBusy(false); }
    return false;
  }
  return <div className="form-actions">
    {done && <p role="status">{done}</p>}
    <FormDialog title={t('leaveUploadBalances')} triggerLabel={t('leaveUploadBalances')} submitLabel={t('leaveUploadBalances')} isSubmitting={busy} onOpenChange={(open) => { if (open) { setErrors([]); setMessage(null); setDone(null); } }} onSubmit={submit}>
    <div className="form-field"><label htmlFor="upload-year">{t('leaveFiscalYear')}</label><input id="upload-year" type="number" min={2500} max={2700} required value={year} onChange={(event) => setYear(event.target.value)} /></div>
    <div className="form-field"><label htmlFor="upload-file">{t('leaveBalanceFile')}</label><input id="upload-file" type="file" accept=".csv,text/csv" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
    {message && <p role="status">{message}</p>}
    {errors.length > 0 && <ul role="alert" className="plain-list form-error">{errors.map((error) => <li key={`${error.row}-${error.column}-${error.code}`}>{t('leaveImportRow')} {error.row} · {error.column}: {leaveErrorMessage(error.code)}</li>)}</ul>}
    </FormDialog>
  </div>;
}
