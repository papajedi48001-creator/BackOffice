'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSectionSaved } from './section-editor';
import type { GpfStatus } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';

type Message = { kind: 'error' | 'saved'; text: string } | null;
const orNull = (value: string) => value.trim() === '' ? null : value.trim();

function useSave(endpoint: string) {
  const router = useRouter();
  const sectionSaved = useSectionSaved();
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  async function save(body: unknown) {
    setMessage(null); setBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (response.ok) { setMessage({ kind: 'saved', text: t('hrProfileSaved') }); router.refresh(); sectionSaved(); return; }
      const code = ((await response.json().catch(() => ({}))) as { error?: string }).error;
      setMessage({ kind: 'error', text: t(code === 'FORBIDDEN' ? 'hrProfileForbidden' : code === 'invalid_input' ? 'hrProfileInvalid' : 'hrProfileSaveFailed') });
    } catch { setMessage({ kind: 'error', text: t('hrProfileSaveFailed') }); } finally { setBusy(false); }
  }
  const feedback = message && (message.kind === 'error' ? <p role="alert" className="form-error">{message.text}</p> : <p role="status">{message.text}</p>);
  return { save, feedback, busy };
}

export interface CivilServiceFormValues {
  positionNumber: string | null; salary: number | null; parentAgency: string | null; gpfStatus: GpfStatus | null; firstAppointedOn: string | null; reappointedOn: string | null;
  transferredInOn: string | null; transferredOutOn: string | null; joinedUnitOn: string | null; currentLevelSince: string | null; qualification: string | null; qualificationMajor: string | null; specialAllowance: string | null;
}
type CivilField = keyof CivilServiceFormValues;
const civilText: [CivilField, MessageKey, number][] = [['positionNumber', 'hrFieldPositionNumber', 32], ['parentAgency', 'hrFieldParentAgency', 255], ['qualification', 'hrFieldQualification', 255], ['qualificationMajor', 'hrFieldQualificationMajor', 255], ['specialAllowance', 'hrFieldSpecialAllowance', 255]];
const civilDates: [CivilField, MessageKey][] = [['firstAppointedOn', 'hrFieldFirstAppointedOn'], ['reappointedOn', 'hrFieldReappointedOn'], ['transferredInOn', 'hrFieldTransferredInOn'], ['transferredOutOn', 'hrFieldTransferredOutOn'], ['joinedUnitOn', 'hrFieldJoinedUnitOn'], ['currentLevelSince', 'hrFieldCurrentLevelSince']];

/** ข้อมูลการปฏิบัติราชการ (ก.พ.7), for HR. The server refuses anyone else. */
export function CivilServiceForm({ endpoint, values }: { endpoint: string; values: CivilServiceFormValues }) {
  const { save, feedback, busy } = useSave(endpoint);
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? '' : String(value)])) as Record<CivilField, string>);
  const set = (field: CivilField) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save({
      ...Object.fromEntries([...civilText, ...civilDates].map(([field]) => [field, orNull(form[field])])),
      salary: form.salary.trim() === '' ? null : Number(form.salary), gpfStatus: form.gpfStatus === '' ? null : form.gpfStatus
    });
  }
  return <form aria-label={t('hrEditCivilService')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditCivilService')}</h4>
    {feedback}
    {civilText.slice(0, 2).map(([field, label, max]) => <label key={field}>{t(label)}<input value={form[field]} maxLength={max} onChange={set(field)} /></label>)}
    <label>{t('hrFieldSalary')}<input type="number" min={0} step="0.01" value={form.salary} onChange={set('salary')} /></label>
    <label>{t('hrFieldGpf')}
      <select value={form.gpfStatus} onChange={set('gpfStatus')}>
        <option value="">{t('notAssigned')}</option>
        <option value="MEMBER">{t('hrGpfMember')}</option>
        <option value="NOT_MEMBER">{t('hrGpfNotMember')}</option>
      </select>
    </label>
    {civilDates.map(([field, label]) => <label key={field}>{t(label)}<input type="date" value={form[field]} onChange={set(field)} /></label>)}
    {civilText.slice(2).map(([field, label, max]) => <label key={field}>{t(label)}<input value={form[field]} maxLength={max} onChange={set(field)} /></label>)}
    <button type="submit" disabled={busy}>{t('hrSaveCivilService')}</button>
  </form>;
}

export interface EducationRow { graduatedOn: string | null; degree: string; major: string | null; institution: string | null; country: string | null }
type RowField = keyof EducationRow;
const blankRow = { graduatedOn: '', degree: '', major: '', institution: '', country: '' };

/** ข้อมูลการศึกษา (ก.พ.7): the person themself and HR edit the whole list; saving replaces it. Rows with no วุฒิ are left out. */
export function EducationForm({ endpoint, entries }: { endpoint: string; entries: EducationRow[] }) {
  const { save, feedback, busy } = useSave(endpoint);
  const [rows, setRows] = useState(() => entries.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value ?? ''])) as Record<RowField, string>));
  const change = (index: number, field: RowField, value: string) => setRows((current) => current.map((row, at) => at === index ? { ...row, [field]: value } : row));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save({ entries: rows.filter((row) => row.degree.trim() !== '').map((row) => ({ graduatedOn: orNull(row.graduatedOn), degree: row.degree.trim(), major: orNull(row.major), institution: orNull(row.institution), country: orNull(row.country) })) });
  }
  const cell = (index: number, field: RowField, label: MessageKey, max: number, type = 'text') => <label>{t(label)}<input type={type} value={rows[index]![field]} maxLength={max} onChange={(event) => change(index, field, event.target.value)} /></label>;
  return <form aria-label={t('hrEditEducation')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditEducation')}</h4>
    {feedback}
    {rows.map((_, index) => <fieldset key={index} className="education-row">
      {cell(index, 'degree', 'hrFieldDegree', 255)}
      {cell(index, 'major', 'hrFieldMajor', 255)}
      {cell(index, 'institution', 'hrFieldInstitution', 255)}
      {cell(index, 'country', 'hrFieldCountry', 120)}
      {cell(index, 'graduatedOn', 'hrFieldGraduatedOn', 10, 'date')}
      <button type="button" className="button-secondary" onClick={() => setRows((current) => current.filter((__, at) => at !== index))}>{t('hrRemoveRow')}</button>
    </fieldset>)}
    {rows.length < 20 ? <button type="button" className="button-secondary" onClick={() => setRows((current) => [...current, { ...blankRow }])}>{t('hrAddEducation')}</button> : null}
    <button type="submit" disabled={busy}>{t('hrSaveEducation')}</button>
  </form>;
}

export interface PositionHistoryRow { effectiveOn: string; description: string; positionNumber: string | null; positionType: string | null; level: string | null; salary: number | null; positionAllowance: number | null; reference: string | null }
type HistoryField = keyof PositionHistoryRow;
const blankHistoryRow: Record<HistoryField, string> = { effectiveOn: '', description: '', positionNumber: '', positionType: '', level: '', salary: '', positionAllowance: '', reference: '' };
const money = (value: string) => value.trim() === '' ? null : Number(value);

/** ตำแหน่งและอัตราเงินเดือน (ก.พ.7): only HR edits the whole list; the server keeps it in date order. Rows with no date or description are left out. */
export function PositionHistoryForm({ endpoint, entries }: { endpoint: string; entries: PositionHistoryRow[] }) {
  const { save, feedback, busy } = useSave(endpoint);
  const [rows, setRows] = useState(() => entries.map((entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, value === null ? '' : String(value)])) as Record<HistoryField, string>));
  const change = (index: number, field: HistoryField, value: string) => setRows((current) => current.map((row, at) => at === index ? { ...row, [field]: value } : row));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save({ entries: rows.filter((row) => row.effectiveOn !== '' && row.description.trim() !== '').map((row) => ({
      effectiveOn: row.effectiveOn, description: row.description.trim(), positionNumber: orNull(row.positionNumber), positionType: orNull(row.positionType), level: orNull(row.level),
      salary: money(row.salary), positionAllowance: money(row.positionAllowance), reference: orNull(row.reference)
    })) });
  }
  const cell = (index: number, field: HistoryField, label: MessageKey, max: number, type = 'text') => <label>{t(label)}<input type={type} value={rows[index]![field]} maxLength={type === 'text' ? max : undefined} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? 0 : undefined} onChange={(event) => change(index, field, event.target.value)} /></label>;
  return <form aria-label={t('hrEditPositionHistory')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrEditPositionHistory')}</h4>
    {feedback}
    {rows.map((_, index) => <fieldset key={index} className="education-row">
      {cell(index, 'effectiveOn', 'hrFieldEffectiveOn', 10, 'date')}
      {cell(index, 'description', 'hrFieldHistoryDescription', 500)}
      {cell(index, 'positionNumber', 'hrFieldPositionNumber', 32)}
      {cell(index, 'positionType', 'hrFieldPositionType', 120)}
      {cell(index, 'level', 'hrFieldHistoryLevel', 120)}
      {cell(index, 'salary', 'hrFieldHistorySalary', 12, 'number')}
      {cell(index, 'positionAllowance', 'hrFieldPositionAllowance', 12, 'number')}
      {cell(index, 'reference', 'hrFieldReference', 255)}
      <button type="button" className="button-secondary" onClick={() => setRows((current) => current.filter((__, at) => at !== index))}>{t('hrRemoveRow')}</button>
    </fieldset>)}
    {rows.length < 200 ? <button type="button" className="button-secondary" onClick={() => setRows((current) => [...current, { ...blankHistoryRow }])}>{t('hrAddPositionHistory')}</button> : null}
    <button type="submit" disabled={busy}>{t('hrSavePositionHistory')}</button>
  </form>;
}
