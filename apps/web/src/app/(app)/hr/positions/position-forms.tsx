'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { positionCategoryLevels, positionCategorySchema, type PositionCategory, type PositionInput } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { categoryLabelKeys } from '../../../../lib/position-labels';

const errorKeys: Record<string, MessageKey> = { DUPLICATE_NAME: 'hrPositionDuplicate', NOT_FOUND: 'hrPositionNotFound', POSITION_IN_USE: 'hrPositionInUse', invalid_input: 'hrPositionLevelsInvalid' };
const importErrorKeys: Record<string, MessageKey> = {
  INVALID_CSV: 'hrPositionImportInvalidCsv', INVALID_HEADER: 'hrPositionImportInvalidHeader', NAME_REQUIRED: 'hrPositionImportNameRequired', UNKNOWN_CATEGORY: 'hrPositionImportUnknownCategory',
  LEVELS_NOT_IN_CATEGORY: 'hrPositionImportLevels', INVALID_ACTIVE: 'hrPositionImportActive', DUPLICATE_ROW: 'hrPositionImportDuplicate'
};

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.ok) return null;
    const code = ((await response.json()) as { error?: string }).error;
    return t(code && errorKeys[code] ? errorKeys[code] : 'hrPositionActionFailed');
  } catch { return t('hrPositionActionFailed'); }
}

/** Edits one position, or adds one when it has no id. A position nobody holds can be deleted; a held one is closed instead. */
export function PositionForm({ position }: { position: PositionInput & { id?: string; holders?: number } }) {
  const router = useRouter();
  const adding = !position.id;
  const [form, setForm] = useState({ name: position.name, category: position.category, levels: [...position.allowedLevels], isActive: position.isActive, sortOrder: String(position.sortOrder) });
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const title = adding ? t('hrAddPosition') : `${t('hrEditPosition')} ${position.name}`;
  const held = (position.holders ?? 0) > 0;

  function changeCategory(category: PositionCategory) {
    setForm({ ...form, category, levels: [...positionCategoryLevels[category]] });
  }
  function toggleLevel(level: string) {
    setForm({ ...form, levels: form.levels.includes(level) ? form.levels.filter((chosen) => chosen !== level) : [...form.levels, level] });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    // Levels go in the category's order, whatever order they were ticked in.
    const allowedLevels = positionCategoryLevels[form.category].filter((level) => form.levels.includes(level));
    const failure = await send(adding ? '/api/hr/positions' : `/api/hr/positions/${position.id}`, adding ? 'POST' : 'PUT', { name: form.name.trim(), category: form.category, allowedLevels, isActive: form.isActive, sortOrder: Number(form.sortOrder) });
    if (failure) { setError(failure); return; }
    if (adding) setForm({ ...form, name: '', sortOrder: String(Math.min(9999, Number(form.sortOrder) + 10)) });
    router.refresh();
  }
  async function remove() {
    const failure = await send(`/api/hr/positions/${position.id}`, 'DELETE');
    setConfirming(false);
    if (failure) { setError(failure); return; }
    router.refresh();
  }

  return <><form aria-label={title} className="profile-form" onSubmit={submit}>
    <h4>{title}</h4>
    {error && <p role="alert" className="form-error">{error}</p>}
    <label>{t('hrPositionName')}<input value={form.name} maxLength={255} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>{t('hrPositionCategory')}
      <select value={form.category} onChange={(event) => changeCategory(event.target.value as PositionCategory)}>
        {positionCategorySchema.options.map((category) => <option key={category} value={category}>{t(categoryLabelKeys[category])}</option>)}
      </select>
    </label>
    {positionCategoryLevels[form.category].length > 0 && <fieldset><legend>{t('hrPositionLevels')}</legend>
      {positionCategoryLevels[form.category].map((level) => <label key={level} className="profile-check"><input type="checkbox" checked={form.levels.includes(level)} onChange={() => toggleLevel(level)} />{level}</label>)}
    </fieldset>}
    <label>{t('hrPositionOrder')}<input type="number" min={0} max={9999} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></label>
    <label className="profile-check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />{t('hrPositionActive')}</label>
    <button type="submit">{adding ? t('hrAddPosition') : t('hrSavePosition')}</button>
    {!adding && <>
      <button type="button" className="danger" disabled={held} onClick={() => setConfirming(true)}>{t('hrDeletePosition')}</button>
      {held && <p>{t('hrPositionHeldHint')}</p>}
    </>}
  </form>
  {confirming && <ActionDialog title={`${t('hrDeletePosition')} ${position.name}`} confirmLabel={t('hrConfirmDelete')} tone="danger" onConfirm={() => void remove()} onClose={() => setConfirming(false)} />}
  </>;
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Imports a CSV of positions: adds or updates by name, all rows or none. */
export function PositionImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) { setResult({ kind: 'error', text: t('hrImportNoFile') }); return; }
    setResult(null);
    try {
      const response = await fetch('/api/hr/positions/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv: await readText(file) }) });
      const body = await response.json() as { created?: number; updated?: number; errors?: { line: number; code: string }[] };
      if (response.ok) {
        setResult({ kind: 'done', text: `${t('hrImportAdded')} ${body.created} ${t('hrPositionUnit')} ${t('hrImportUpdated')} ${body.updated} ${t('hrPositionUnit')}` });
        router.refresh();
        return;
      }
      const lines = (body.errors ?? []).map((error) => `${t('hrImportLine')} ${error.line}: ${t(importErrorKeys[error.code] ?? 'hrPositionActionFailed')}`);
      setResult({ kind: 'error', text: lines.length > 0 ? lines.join(' · ') : t('hrPositionActionFailed') });
    } catch { setResult({ kind: 'error', text: t('hrPositionActionFailed') }); }
  }

  return <form aria-label={t('hrImportPositions')} className="profile-form" onSubmit={submit}>
    <h4>{t('hrImportPositions')}</h4>
    {result && (result.kind === 'error' ? <p role="alert" className="form-error">{result.text}</p> : <p role="status">{result.text}</p>)}
    <label>{t('hrCsvFile')}<input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
    <button type="submit">{t('hrImportButton')}</button>
  </form>;
}
