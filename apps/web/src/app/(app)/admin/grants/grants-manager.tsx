'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GrantableRole } from '@backoffice/contracts';
import type { AdminGrantRow } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { isTesterRole, managerRoles, roleLabel, roleNeedsHrDataOwner, sendAdmin, testerRoles } from '../../../../lib/admin-labels';
import { PersonPicker, type PickedPerson } from '../person-picker';

type Editing = { mode: 'add' } | { mode: 'edit'; grant: AdminGrantRow };

/** The grant list with add, edit and delete, each in a popup. The server refuses anything a non-admin sends and keeps the last admin. */
export function GrantsManager({ grants, currentPersonId }: { grants: AdminGrantRow[]; currentPersonId: string }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<AdminGrantRow | null>(null);
  return <>
    <div className="form-actions"><button type="button" onClick={() => setEditing({ mode: 'add' })}>{t('adminAddGrant')}</button></div>
    {grants.length === 0 ? <p>{t('adminNoGrants')}</p> : <div className="leave-table-scroll"><table className="admin-grant-table">
      <thead><tr><th>{t('adminPerson')}</th><th>{t('adminRoles')}</th><th></th></tr></thead>
      <tbody>{grants.map((grant) => <tr key={grant.personId}>
        <td><strong>{grant.displayName ?? '—'}</strong>{grant.personId === currentPersonId ? ` ${t('adminYou')}` : ''}<small className="admin-muted">{[grant.employeeCode, grant.positionTitle, grant.active ? null : t('adminPersonInactive')].filter(Boolean).join(' · ')}</small></td>
        <td><ul className="admin-role-chips">{grant.roleNames.map((role) => <li key={role} className={role === 'admin' ? 'is-admin' : isTesterRole(role) ? 'is-tester' : undefined}>{roleLabel(role)}{roleNeedsHrDataOwner(role) && !grant.ownsHrData ? <span className="admin-warning-mark" title={t('adminNeedsHrDataOwner')}> *</span> : null}</li>)}</ul></td>
        <td className="request-actions">
          <button type="button" aria-label={`${t('adminEditGrant')} ${grant.displayName ?? ''}`} onClick={() => setEditing({ mode: 'edit', grant })}>{t('adminEditGrant')}</button>
          <button type="button" className="button-secondary" aria-label={`${t('adminDeleteGrant')} ${grant.displayName ?? ''}`} onClick={() => setDeleting(grant)}>{t('adminDeleteGrant')}</button>
        </td>
      </tr>)}</tbody>
    </table></div>}
    {grants.some((grant) => grant.roleNames.some((role) => roleNeedsHrDataOwner(role)) && !grant.ownsHrData) && <p className="admin-muted">* {t('adminNeedsHrDataOwner')}</p>}
    {editing && <GrantDialog editing={editing} grants={grants} onClose={() => setEditing(null)} />}
    {deleting && <DeleteGrantDialog grant={deleting} onClose={() => setDeleting(null)} />}
  </>;
}

function GrantDialog({ editing, grants, onClose }: { editing: Editing; grants: AdminGrantRow[]; onClose: () => void }) {
  const router = useRouter();
  const id = useId();
  const [person, setPerson] = useState<PickedPerson | null>(editing.mode === 'edit' ? { personId: editing.grant.personId, displayName: editing.grant.displayName, employeeCode: editing.grant.employeeCode, organizationName: null } : null);
  const existing = (personId: string | undefined) => grants.find((grant) => grant.personId === personId)?.roleNames ?? [];
  const [roles, setRoles] = useState<GrantableRole[]>(editing.mode === 'edit' ? editing.grant.roleNames : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(next: PickedPerson | null) {
    setPerson(next);
    // Adding someone who already holds roles starts from what they have, so nothing is taken away by accident.
    if (editing.mode === 'add') setRoles(existing(next?.personId));
  }

  async function save() {
    if (!person) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/people/${encodeURIComponent(person.personId)}/roles`, 'PUT', { roleNames: roles });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    onClose();
    router.refresh();
  }

  const checkbox = (role: GrantableRole) => <label key={role} htmlFor={`${id}-${role}`}>
    <input id={`${id}-${role}`} type="checkbox" checked={roles.includes(role)} onChange={(event) => setRoles((current) => event.target.checked ? [...current, role] : current.filter((value) => value !== role))} />
    {roleLabel(role)}
  </label>;

  return <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={t(editing.mode === 'add' ? 'adminAddGrant' : 'adminEditGrant')} submitLabel={t('adminSave')} ready={Boolean(person) && (editing.mode === 'edit' || roles.length > 0)} isSubmitting={busy} error={error} onSubmit={() => save()}>
    {editing.mode === 'add' ? <PersonPicker person={person} onPick={pick} /> : <p className="admin-picked"><strong>{person?.displayName ?? '—'}</strong>{person?.employeeCode ? <small> · {person.employeeCode}</small> : null}</p>}
    <fieldset className="admin-role-options" disabled={!person}>
      <legend>{t('adminChooseRoles')}</legend>
      {managerRoles.map(checkbox)}
    </fieldset>
    <fieldset className="admin-role-options is-testers" disabled={!person}>
      <legend>{t('adminTesterRolesLegend')}</legend>
      {testerRoles.map(checkbox)}
    </fieldset>
  </FormDialog>;
}

function DeleteGrantDialog({ grant, onClose }: { grant: AdminGrantRow; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/people/${encodeURIComponent(grant.personId)}/roles`, 'PUT', { roleNames: [] });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    onClose();
    router.refresh();
  }
  return <ActionDialog title={`${t('adminDeleteGrant')}: ${grant.displayName ?? '—'}`} message={`${t('adminConfirmDeleteGrantMessage')} (${grant.roleNames.map(roleLabel).join(', ')})`} confirmLabel={t('adminDeleteGrant')} tone="danger" isSubmitting={busy} error={error} onConfirm={() => void remove()} onClose={onClose} />;
}
