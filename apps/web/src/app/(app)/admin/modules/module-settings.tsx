'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ModuleMode } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { roleLabel, roleNeedsHrDataOwner, sendAdmin } from '../../../../lib/admin-labels';
import { PersonPicker, type PickedPerson } from '../person-picker';

export interface ModuleManager { personId: string; displayName: string | null; employeeCode: string | null; ownsHrData: boolean; active: boolean }
export interface ModuleSettingRow { code: string; label: string; description: string; mode: ModuleMode; locked: boolean; managerRole: string | null; managers: ModuleManager[]; testerRole: string | null; testers: ModuleManager[] }

/** The three modes in the order the control shows them. */
const modes: Array<{ mode: ModuleMode; labelKey: MessageKey; statusClass: string }> = [
  { mode: 'ON', labelKey: 'adminModeOn', statusClass: 'approved' },
  { mode: 'DEVELOPMENT', labelKey: 'adminModeDevelopment', statusClass: 'pending' },
  { mode: 'OFF', labelKey: 'adminModeOff', statusClass: 'cancelled' }
];
const modeLabel = (mode: ModuleMode) => t(modes.find((entry) => entry.mode === mode)!.labelKey);
const confirmKeys: Record<ModuleMode, MessageKey> = { ON: 'adminConfirmModeOnMessage', DEVELOPMENT: 'adminConfirmModeDevelopmentMessage', OFF: 'adminConfirmModeOffMessage' };

/** The module list: a three-way เปิด/พัฒนา/ปิด control per module (confirmed in a popup) and, on the module's name, a popup of its ผู้จัดการ and ผู้ทดสอบ. */
export function ModuleSettings({ rows, admins }: { rows: ModuleSettingRow[]; admins: ModuleManager[] }) {
  const router = useRouter();
  const [toggling, setToggling] = useState<{ row: ModuleSettingRow; mode: ModuleMode } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedRow = rows.find((row) => row.code === opened) ?? null;

  async function toggle() {
    if (!toggling) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/modules/${encodeURIComponent(toggling.row.code)}`, 'PUT', { mode: toggling.mode });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setToggling(null);
    router.refresh();
  }

  return <>
    <div className="leave-table-scroll"><table className="admin-module-table">
      <thead><tr><th>{t('adminModule')}</th><th>{t('adminModuleManagers')}</th><th>{t('status')}</th><th></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.code}>
        <td><button type="button" className="admin-link-button" onClick={() => setOpened(row.code)}>{row.label}</button><small className="admin-muted">{row.description}</small></td>
        <td>{row.managerRole ? (row.managers.length === 0 ? <span className="admin-muted">{t('adminNoManagers')}</span> : row.managers.map((manager) => manager.displayName ?? '—').join(', ')) : <span className="admin-muted">{t('adminRoleAdmin')}</span>}</td>
        <td><span className={`status status-${modes.find((entry) => entry.mode === row.mode)!.statusClass}`}>{modeLabel(row.mode)}</span></td>
        <td className="request-actions">{row.locked
          ? <span className="admin-muted">{t('adminModuleLocked')}</span>
          : <div className="mode-switch" role="group" aria-label={`${t('adminModeOf')} ${row.label}`}>{modes.map((entry) => <button key={entry.mode} type="button" data-mode={entry.mode} aria-pressed={row.mode === entry.mode} disabled={row.mode === entry.mode} onClick={() => { setError(null); setToggling({ row, mode: entry.mode }); }}>{t(entry.labelKey)}</button>)}</div>}</td>
      </tr>)}</tbody>
    </table></div>
    {toggling && <ActionDialog title={`${t('adminConfirmModeTitle')}: ${toggling.row.label}`} message={`${modeLabel(toggling.row.mode)} → ${modeLabel(toggling.mode)} — ${t(confirmKeys[toggling.mode])}`}
      confirmLabel={`${t('adminChangeModeTo')}${modeLabel(toggling.mode)}`} tone={toggling.mode === 'OFF' ? 'danger' : 'primary'} isSubmitting={busy} error={error} onConfirm={() => void toggle()} onClose={() => setToggling(null)} />}
    {openedRow && <ManagersDialog row={openedRow} admins={admins} onClose={() => setOpened(null)} />}
  </>;
}

type ModuleRoleKind = 'manager' | 'tester';

/** ผู้จัดการ and ผู้ทดสอบ of one module: add by search (choosing which role), remove with a confirm. Admins are listed as managers of everything. */
function ManagersDialog({ row, admins, onClose }: { row: ModuleSettingRow; admins: ModuleManager[]; onClose: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<ModuleRoleKind>(row.managerRole ? 'manager' : 'tester');
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [removing, setRemoving] = useState<{ person: ModuleManager; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = kind === 'manager' ? row.managerRole : row.testerRole;

  async function add() {
    if (!role || !person) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/people/${encodeURIComponent(person.personId)}/roles`, 'POST', { roleName: role });
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setPerson(null);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/people/${encodeURIComponent(removing.person.personId)}/roles/${encodeURIComponent(removing.role)}`, 'DELETE');
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setRemoving(null);
    router.refresh();
  }

  const holders = (roleName: string, people: ModuleManager[], emptyKey: MessageKey) => <>
    <h3 className="admin-subheading">{roleLabel(roleName)}</h3>
    {people.length === 0 ? <p className="admin-muted">{t(emptyKey)}</p> : <ul className="admin-person-list">{people.map((holder) => <li key={holder.personId}>
      <span>{holder.displayName ?? '—'}{holder.employeeCode ? <small> · {holder.employeeCode}</small> : null}{!holder.active ? <small> · {t('adminPersonInactive')}</small> : null}
        {roleNeedsHrDataOwner(roleName) && !holder.ownsHrData ? <small className="admin-warning">{t('adminNeedsHrDataOwner')}</small> : null}</span>
      <button type="button" className="button-secondary" aria-label={`${t('adminRemove')} ${holder.displayName ?? ''}`} onClick={() => { setError(null); setRemoving({ person: holder, role: roleName }); }}>{t('adminRemove')}</button>
    </li>)}</ul>}
  </>;

  return <>
    <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={`${t('adminManagersOf')}: ${row.label}`} submitLabel={t('adminAddHolder')} ready={Boolean(role && person)} isSubmitting={busy} error={removing ? null : error} onSubmit={() => add()}>
      {row.managerRole ? holders(row.managerRole, row.managers, 'adminNoManagers') : <p className="admin-muted">{t('adminNoManagerRole')}</p>}
      {row.testerRole ? holders(row.testerRole, row.testers, 'adminNoTesters') : null}
      {(row.managerRole || row.testerRole) && <>
        <fieldset className="admin-role-options">
          <legend>{t('adminAddAs')}</legend>
          {row.managerRole && <label><input type="radio" name={`kind-${row.code}`} checked={kind === 'manager'} onChange={() => setKind('manager')} />{t('adminKindManager')}</label>}
          {row.testerRole && <label><input type="radio" name={`kind-${row.code}`} checked={kind === 'tester'} onChange={() => setKind('tester')} />{t('adminRoleTester')}</label>}
        </fieldset>
        <PersonPicker person={person} onPick={setPerson} />
      </>}
      <p className="admin-muted">{t('adminAdminsManageAll')}{admins.length > 0 ? `: ${admins.map((admin) => admin.displayName ?? '—').join(', ')}` : ''}</p>
    </FormDialog>
    {removing && <ActionDialog title={`${t('adminConfirmRemoveTitle')}: ${roleLabel(removing.role)}`} message={`${removing.person.displayName ?? '—'} — ${t('adminConfirmRemoveMessage')}`} confirmLabel={t('adminRemove')} tone="danger" isSubmitting={busy} error={error} onConfirm={() => void remove()} onClose={() => setRemoving(null)} />}
  </>;
}
