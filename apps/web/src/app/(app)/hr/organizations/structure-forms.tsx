'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, type MessageKey } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';

export interface UnitOption { id: string; name: string }
export interface EditableUnit { id: string; name: string; unitType: string | null; parentId: string | null }

const errorKeys: Record<string, MessageKey> = { DUPLICATE_NAME: 'hrErrorDuplicateUnitName', PARENT_NOT_DIVISION: 'hrErrorParentNotDivision', ORGANIZATION_NOT_FOUND: 'hrOrganizationNotFound' };
const nameLabel = (unitType: string | null): MessageKey => unitType === 'DIVISION' ? 'hrDivisionName' : unitType === 'SECTION' ? 'hrSectionName' : 'hrUnitName';
const deleteLabel = (unitType: string | null): MessageKey => unitType === 'DIVISION' ? 'hrDeleteDivision' : unitType === 'SECTION' ? 'hrDeleteSection' : 'hrDeleteUnit';

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.ok) return null;
    const code = ((await response.json()) as { error?: string }).error;
    return t(code && errorKeys[code] ? errorKeys[code] : 'hrOrganizationActionFailed');
  } catch { return t('hrOrganizationActionFailed'); }
}

/** Adds a กลุ่มงาน, or a งาน under a chosen กลุ่มงาน. */
export function AddUnitForms({ divisions }: { divisions: UnitOption[] }) {
  const router = useRouter();
  const [divisionName, setDivisionName] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [parentId, setParentId] = useState(divisions[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent, body: Record<string, string>, reset: () => void) {
    event.preventDefault();
    setError(null);
    const failure = await send('/api/hr/organizations', 'POST', body);
    if (failure) { setError(failure); return; }
    reset();
    router.refresh();
  }

  return <div className="organization-forms">
    {error && <p role="alert" className="form-error">{error}</p>}
    <form aria-label={t('hrAddDivision')} className="organization-form" onSubmit={(event) => add(event, { name: divisionName.trim(), unitType: 'DIVISION' }, () => setDivisionName(''))}>
      <label>{t('hrDivisionName')}<input value={divisionName} maxLength={255} required onChange={(event) => setDivisionName(event.target.value)} /></label>
      <button type="submit">{t('hrAddDivision')}</button>
    </form>
    {divisions.length > 0 && <form aria-label={t('hrAddSection')} className="organization-form" onSubmit={(event) => add(event, { name: sectionName.trim(), unitType: 'SECTION', parentId }, () => setSectionName(''))}>
      <label>{t('hrSectionName')}<input value={sectionName} maxLength={255} required onChange={(event) => setSectionName(event.target.value)} /></label>
      <label>{t('hrDivision')}
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
      </label>
      <button type="submit">{t('hrAddSection')}</button>
    </form>}
  </div>;
}

/** Renames a unit, moves a งาน to another กลุ่มงาน, or deletes the unit after saying what that affects. */
export function UnitEditForms({ unit, divisions, impact }: { unit: EditableUnit; divisions: UnitOption[]; impact: { units: number; people: number } }) {
  const router = useRouter();
  const [name, setName] = useState(unit.name);
  const [parentId, setParentId] = useState(unit.parentId ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const movable = unit.unitType === 'SECTION';

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const failure = await send(`/api/hr/organizations/${unit.id}`, 'PUT', { name: name.trim(), ...(movable && parentId ? { parentId } : {}) });
    if (failure) { setError(failure); return; }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const failure = await send(`/api/hr/organizations/${unit.id}`, 'DELETE');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setConfirming(false);
    router.push('/hr/organizations');
  }

  const message = impact.units > 1
    ? `${t('hrDeleteManyPrefix')} ${impact.units} ${t('hrDeleteManyMiddle')} ${impact.people} ${t('hrDeletePeopleSuffix')}`
    : `${t('hrDeleteOnePrefix')} ${impact.people} ${t('hrDeletePeopleSuffix')}`;
  return <div className="organization-forms">
    {error && <p role="alert" className="form-error">{error}</p>}
    <form className="organization-form" onSubmit={save}>
      <label>{t(nameLabel(unit.unitType))}<input value={name} maxLength={255} required onChange={(event) => setName(event.target.value)} /></label>
      {movable && <label>{t('hrInDivision')}
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          {divisions.map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
      </label>}
      <button type="submit">{t('hrSaveUnitName')}</button>
    </form>
    <p><button type="button" className="button-secondary" onClick={() => setConfirming(true)}>{t(deleteLabel(unit.unitType))}</button></p>
    {confirming && <ActionDialog title={t(deleteLabel(unit.unitType))} message={message} confirmLabel={t('hrConfirmDelete')} tone="danger" isSubmitting={busy} error={error} onConfirm={() => void remove()} onClose={() => setConfirming(false)} />}
  </div>;
}
