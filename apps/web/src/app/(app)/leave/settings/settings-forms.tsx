'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CommandChainTarget, Gender, LeaveCounting } from '@backoffice/contracts';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { leaveCountingLabel, leaveErrorMessage, leaveTargetLabel } from '../../../../lib/leave-labels';

interface TypeValue { id?: string; code: string; name: string; counting: LeaveCounting; approvalTarget: CommandChainTarget; attachmentRequiredFromDays: number | null; eligibleGender: Gender | null; isActive: boolean; sortOrder: number }
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
  return { save, error, busy, setError };
}

const optionalNumber = (text: string) => (text.trim() === '' ? null : Number(text));
const text = (value: number | null) => (value === null ? '' : String(value));

export function LeaveTypeForm({ type }: { type: TypeValue }) {
  const { save, error, busy, setError } = useSave();
  const [form, setForm] = useState({ ...type, attachment: text(type.attachmentRequiredFromDays), order: String(type.sortOrder) });
  const adding = !type.id;
  const title = adding ? t('leaveAddType') : `${t('leaveEditType')} ${type.name}`;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { name: form.name.trim(), counting: form.counting, approvalTarget: form.approvalTarget, attachmentRequiredFromDays: optionalNumber(form.attachment), eligibleGender: form.eligibleGender, isActive: form.isActive, sortOrder: Number(form.order) };
    const saved = await save(adding ? '/api/leave/types' : `/api/leave/types/${type.id}`, adding ? 'POST' : 'PUT', adding ? { code: form.code.trim(), ...body } : body);
    if (saved && adding) setForm({ ...form, code: '', name: '', order: String(Number(form.order) + 1) });
    return saved;
  }
  return <div className="profile-form">
    {adding ? null : <><h4>{type.name} <span className="organization-code">{type.code}</span></h4>
      <p>{leaveCountingLabel(type.counting)} · {leaveTargetLabel(type.approvalTarget)} · {type.isActive ? t('leaveTypeActive') : t('hrEmploymentTypeInactive')}</p></>}
    <FormDialog title={title} triggerLabel={adding ? t('leaveAddType') : t('formEdit')} triggerAriaLabel={adding ? undefined : title} submitLabel={adding ? t('leaveAddType') : t('leaveSave')} isSubmitting={busy} error={error} onOpenChange={(open) => { if (open) setError(null); }} onSubmit={submit}>
    {adding ? <label>{t('leaveTypeCode')}<input value={form.code} maxLength={32} required onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label> : <p className="organization-code">{type.code}</p>}
    <label>{t('leaveTypeName')}<input value={form.name} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>{t('leaveCounting')}<select value={form.counting} onChange={(event) => setForm({ ...form, counting: event.target.value as LeaveCounting })}>{(['WORKING_DAYS', 'CALENDAR_DAYS'] as const).map((value) => <option key={value} value={value}>{leaveCountingLabel(value)}</option>)}</select></label>
    <label>{t('leaveApprovalTarget')}<select value={form.approvalTarget} onChange={(event) => setForm({ ...form, approvalTarget: event.target.value as CommandChainTarget })}>{(['SECTION', 'DIVISION', 'HOSPITAL', 'NEAREST_HEAD'] as const).map((value) => <option key={value} value={value}>{leaveTargetLabel(value)}</option>)}</select></label>
    <label>{t('leaveAttachmentFrom')}<input type="number" min={0.5} step={0.5} value={form.attachment} onChange={(event) => setForm({ ...form, attachment: event.target.value })} /></label>
    <label>{t('leaveEligibleGender')}<select value={form.eligibleGender ?? ''} onChange={(event) => setForm({ ...form, eligibleGender: (event.target.value || null) as Gender | null })}><option value="">{t('leaveGenderAny')}</option><option value="MALE">{t('leaveGenderMale')}</option><option value="FEMALE">{t('leaveGenderFemale')}</option></select></label>
    <label>{t('leaveTypeOrder')}<input type="number" min={0} max={9999} value={form.order} onChange={(event) => setForm({ ...form, order: event.target.value })} /></label>
    <label className="profile-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{t('leaveTypeActive')}</label>
    </FormDialog>
  </div>;
}

export function EntitlementForm({ employmentType, leaveType, value }: { employmentType: { id: string; name: string }; leaveType: { id: string; name: string }; value: EntitlementValue | null }) {
  const { save, error, busy, setError } = useSave();
  const [form, setForm] = useState({ daysPerYear: text(value?.daysPerYear ?? null), firstYearDays: text(value?.firstYearDays ?? null), maxAccumulatedDays: text(value?.maxAccumulatedDays ?? null), maxAccumulatedDaysAfter10Years: text(value?.maxAccumulatedDaysAfter10Years ?? null), minServiceMonths: String(value?.minServiceMonths ?? 0) });
  const [dialog, setDialog] = useState<'edit' | 'remove' | null>(null);
  const id = `${employmentType.id}-${leaveType.id}`;
  const key = { employmentTypeId: employmentType.id, leaveTypeId: leaveType.id };
  const title = `${t('leaveEntitled')} ${employmentType.name} ${leaveType.name}`;
  function submit(event: React.FormEvent) {
    event.preventDefault();
    return save('/api/leave/entitlements', 'PUT', { ...key, daysPerYear: Number(form.daysPerYear), firstYearDays: optionalNumber(form.firstYearDays), maxAccumulatedDays: optionalNumber(form.maxAccumulatedDays), maxAccumulatedDaysAfter10Years: optionalNumber(form.maxAccumulatedDaysAfter10Years), minServiceMonths: Number(form.minServiceMonths) });
  }
  const field = (name: keyof typeof form, labelKey: Parameters<typeof t>[0], required = false) => <div className="form-field"><label htmlFor={`${id}-${name}`}>{t(labelKey)}</label><input id={`${id}-${name}`} type="number" min={0} step={name === 'minServiceMonths' ? 1 : 0.5} required={required} value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value })} /></div>;
  const shown = (number: number | null | undefined) => (number === null || number === undefined ? t('leaveNotSet') : String(number));
  const open = (next: 'edit' | 'remove' | null) => { setError(null); setDialog(next); };
  return <div className="profile-form">
    <h5>{leaveType.name}{!value && <span className="inventory-flag">{t('leaveNoEntitlement')}</span>}</h5>
    {error && !dialog && <p role="alert" className="form-error">{error}</p>}
    {value && <dl className="leave-entitlement-summary">
      <div><dt>{t('leaveDaysPerYear')}</dt><dd>{shown(value.daysPerYear)}</dd></div>
      <div><dt>{t('leaveFirstYearDays')}</dt><dd>{shown(value.firstYearDays)}</dd></div>
      <div><dt>{t('leaveMaxAccumulated')}</dt><dd>{shown(value.maxAccumulatedDays)}</dd></div>
      <div><dt>{t('leaveMaxAccumulated10')}</dt><dd>{shown(value.maxAccumulatedDaysAfter10Years)}</dd></div>
      <div><dt>{t('leaveMinServiceMonths')}</dt><dd>{shown(value.minServiceMonths)}</dd></div>
    </dl>}
    <div className="form-actions">
      <FormDialog title={title} triggerLabel={t('formEdit')} triggerAriaLabel={title} submitLabel={t('leaveSetEntitlement')} open={dialog === 'edit'} onOpenChange={(next) => (next ? open('edit') : setDialog(null))} isSubmitting={busy} error={error} onSubmit={submit}>
        {field('daysPerYear', 'leaveDaysPerYear', true)}
        {field('firstYearDays', 'leaveFirstYearDays')}
        {field('maxAccumulatedDays', 'leaveMaxAccumulated')}
        {field('maxAccumulatedDaysAfter10Years', 'leaveMaxAccumulated10')}
        {field('minServiceMonths', 'leaveMinServiceMonths', true)}
      </FormDialog>
      {value && <button type="button" className="button-danger" aria-label={`${t('leaveRemoveEntitlement')} ${employmentType.name} ${leaveType.name}`} disabled={busy} onClick={() => open('remove')}>{t('leaveRemoveEntitlement')}</button>}
    </div>
    {dialog === 'remove' && <ActionDialog title={`${t('leaveRemoveEntitlement')} ${employmentType.name} ${leaveType.name}`} confirmLabel={t('leaveRemoveEntitlement')} tone="danger" isSubmitting={busy} error={error}
      onConfirm={() => void save('/api/leave/entitlements', 'DELETE', key).then((done) => { if (done) setDialog(null); })} onClose={() => setDialog(null)} />}
  </div>;
}

export function MinWorkingDaysForm({ value }: { value: number }) {
  const { save, error, busy, setError } = useSave();
  const [minimum, setMinimum] = useState(String(value));
  return <div className="profile-form">
    <p className="permission-notice">{t('leaveMinWorkingDaysHelp')}</p>
    <p>{t('leaveMinWorkingDays')}: <strong>{value}</strong></p>
    <FormDialog title={t('leaveMinWorkingDays')} triggerLabel={t('formEdit')} triggerAriaLabel={t('leaveMinWorkingDays')} submitLabel={t('leaveSave')} isSubmitting={busy} error={error} onOpenChange={(open) => { if (open) setError(null); }}
      onSubmit={(event) => { event.preventDefault(); return save('/api/leave/settings', 'PUT', { minWorkingDaysPerMonth: Number(minimum) }); }}>
      <div className="form-field"><label htmlFor="leave-minimum">{t('leaveMinWorkingDays')}</label><input id="leave-minimum" type="number" min={0} max={31} required value={minimum} onChange={(event) => setMinimum(event.target.value)} /></div>
    </FormDialog>
  </div>;
}
