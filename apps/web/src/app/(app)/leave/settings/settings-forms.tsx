'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommandChainTarget, LeaveCounting } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { leaveCountingLabel, leaveErrorMessage, leaveTargetLabel } from '../../../../lib/leave-labels';

interface TypeValue { id?: string; code: string; name: string; counting: LeaveCounting; approvalTarget: CommandChainTarget; attachmentRequiredFromDays: number | null; isActive: boolean; sortOrder: number }
interface EntitlementValue { daysPerYear: number; firstYearDays: number | null; maxAccumulatedDays: number | null; maxAccumulatedDaysAfter10Years: number | null; minServiceMonths: number }

/** Sends one JSON change and refreshes the page; a failure shows its Thai message. */
function useSave() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true); setError(null);
    try {
      const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { router.refresh(); return true; }
      setError(leaveErrorMessage(((await response.json()) as { error?: string }).error));
    } catch { setError(leaveErrorMessage(null)); } finally { setBusy(false); }
    return false;
  }
  return { save, error, busy };
}

const optionalNumber = (text: string) => (text.trim() === '' ? null : Number(text));
const text = (value: number | null) => (value === null ? '' : String(value));

export function LeaveTypeForm({ type }: { type: TypeValue }) {
  const { save, error, busy } = useSave();
  const [form, setForm] = useState({ ...type, attachment: text(type.attachmentRequiredFromDays), order: String(type.sortOrder) });
  const adding = !type.id;
  const title = adding ? t('leaveAddType') : `${t('leaveEditType')} ${type.name}`;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { name: form.name.trim(), counting: form.counting, approvalTarget: form.approvalTarget, attachmentRequiredFromDays: optionalNumber(form.attachment), isActive: form.isActive, sortOrder: Number(form.order) };
    const saved = await save(adding ? '/api/leave/types' : `/api/leave/types/${type.id}`, adding ? 'POST' : 'PUT', adding ? { code: form.code.trim(), ...body } : body);
    if (saved && adding) setForm({ ...form, code: '', name: '', order: String(Number(form.order) + 1) });
  }
  return <form aria-label={title} className="profile-form" onSubmit={submit}>
    <h4>{title}</h4>
    {error && <p role="alert" className="form-error">{error}</p>}
    {adding ? <label>{t('leaveTypeCode')}<input value={form.code} maxLength={32} required onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label> : <p className="organization-code">{type.code}</p>}
    <label>{t('leaveTypeName')}<input value={form.name} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>{t('leaveCounting')}<select value={form.counting} onChange={(event) => setForm({ ...form, counting: event.target.value as LeaveCounting })}>{(['WORKING_DAYS', 'CALENDAR_DAYS'] as const).map((value) => <option key={value} value={value}>{leaveCountingLabel(value)}</option>)}</select></label>
    <label>{t('leaveApprovalTarget')}<select value={form.approvalTarget} onChange={(event) => setForm({ ...form, approvalTarget: event.target.value as CommandChainTarget })}>{(['SECTION', 'DIVISION', 'HOSPITAL', 'NEAREST_HEAD'] as const).map((value) => <option key={value} value={value}>{leaveTargetLabel(value)}</option>)}</select></label>
    <label>{t('leaveAttachmentFrom')}<input type="number" min={0.5} step={0.5} value={form.attachment} onChange={(event) => setForm({ ...form, attachment: event.target.value })} /></label>
    <label>{t('leaveTypeOrder')}<input type="number" min={0} max={9999} value={form.order} onChange={(event) => setForm({ ...form, order: event.target.value })} /></label>
    <label className="profile-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{t('leaveTypeActive')}</label>
    <button type="submit" disabled={busy}>{adding ? t('leaveAddType') : t('leaveSave')}</button>
  </form>;
}

export function EntitlementForm({ employmentType, leaveType, value }: { employmentType: { id: string; name: string }; leaveType: { id: string; name: string }; value: EntitlementValue | null }) {
  const { save, error, busy } = useSave();
  const [form, setForm] = useState({ daysPerYear: text(value?.daysPerYear ?? null), firstYearDays: text(value?.firstYearDays ?? null), maxAccumulatedDays: text(value?.maxAccumulatedDays ?? null), maxAccumulatedDaysAfter10Years: text(value?.maxAccumulatedDaysAfter10Years ?? null), minServiceMonths: String(value?.minServiceMonths ?? 0) });
  const id = `${employmentType.id}-${leaveType.id}`;
  const key = { employmentTypeId: employmentType.id, leaveTypeId: leaveType.id };
  function submit(event: React.FormEvent) {
    event.preventDefault();
    void save('/api/leave/entitlements', 'PUT', { ...key, daysPerYear: Number(form.daysPerYear), firstYearDays: optionalNumber(form.firstYearDays), maxAccumulatedDays: optionalNumber(form.maxAccumulatedDays), maxAccumulatedDaysAfter10Years: optionalNumber(form.maxAccumulatedDaysAfter10Years), minServiceMonths: Number(form.minServiceMonths) });
  }
  const field = (name: keyof typeof form, labelKey: Parameters<typeof t>[0], required = false) => <div className="form-field"><label htmlFor={`${id}-${name}`}>{t(labelKey)}</label><input id={`${id}-${name}`} type="number" min={0} step={name === 'minServiceMonths' ? 1 : 0.5} required={required} value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} /></div>;
  return <form aria-label={`${t('leaveEntitled')} ${employmentType.name} ${leaveType.name}`} className="profile-form" onSubmit={submit}>
    <h5>{leaveType.name}{!value && <span className="inventory-flag">{t('leaveNoEntitlement')}</span>}</h5>
    {error && <p role="alert" className="form-error">{error}</p>}
    {field('daysPerYear', 'leaveDaysPerYear', true)}
    {field('firstYearDays', 'leaveFirstYearDays')}
    {field('maxAccumulatedDays', 'leaveMaxAccumulated')}
    {field('maxAccumulatedDaysAfter10Years', 'leaveMaxAccumulated10')}
    {field('minServiceMonths', 'leaveMinServiceMonths', true)}
    <div className="form-actions">
      <button type="submit" disabled={busy}>{t('leaveSetEntitlement')}</button>
      {value && <button type="button" className="button-danger" disabled={busy} onClick={() => void save('/api/leave/entitlements', 'DELETE', key)}>{t('leaveRemoveEntitlement')}</button>}
    </div>
  </form>;
}

export function MinWorkingDaysForm({ value }: { value: number }) {
  const { save, error, busy } = useSave();
  const [minimum, setMinimum] = useState(String(value));
  return <form aria-label={t('leaveMinWorkingDays')} className="profile-form" onSubmit={(event) => { event.preventDefault(); void save('/api/leave/settings', 'PUT', { minWorkingDaysPerMonth: Number(minimum) }); }}>
    <p className="permission-notice">{t('leaveMinWorkingDaysHelp')}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-field"><label htmlFor="leave-minimum">{t('leaveMinWorkingDays')}</label><input id="leave-minimum" type="number" min={0} max={31} required value={minimum} onChange={(event) => setMinimum(event.target.value)} /></div>
    <button type="submit" disabled={busy}>{t('leaveSave')}</button>
  </form>;
}
