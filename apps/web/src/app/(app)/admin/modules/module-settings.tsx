'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { AdminFormDialog } from '../../../../components/admin-form-dialog';
import { roleLabel, roleNeedsHrDataOwner, sendAdmin } from '../../../../lib/admin-labels';
import { PersonPicker, type PickedPerson } from '../person-picker';

export interface ModuleManager { personId: string; displayName: string | null; employeeCode: string | null; ownsHrData: boolean; active: boolean }
export interface ModuleSettingRow { code: string; label: string; description: string; enabled: boolean; locked: boolean; managerRole: string | null; managers: ModuleManager[] }

/** The module list: a switch per module (confirmed in a popup) and, on the module's name, a popup of its ผู้จัดการ. */
export function ModuleSettings({ rows, admins }: { rows: ModuleSettingRow[]; admins: ModuleManager[] }) {
  const router = useRouter();
  const [toggling, setToggling] = useState<ModuleSettingRow | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedRow = rows.find((row) => row.code === opened) ?? null;

  async function toggle() {
    if (!toggling) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/modules/${encodeURIComponent(toggling.code)}`, 'PUT', { enabled: !toggling.enabled });
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
        <td><span className={`status status-${row.enabled ? 'approved' : 'cancelled'}`}>{t(row.enabled ? 'adminModuleOn' : 'adminModuleOff')}</span></td>
        <td className="request-actions">{row.locked
          ? <span className="admin-muted">{t('adminModuleLocked')}</span>
          : <button type="button" className={row.enabled ? 'button-secondary' : undefined} aria-label={`${t(row.enabled ? 'adminTurnOff' : 'adminTurnOn')} ${row.label}`} onClick={() => { setError(null); setToggling(row); }}>{t(row.enabled ? 'adminTurnOff' : 'adminTurnOn')}</button>}</td>
      </tr>)}</tbody>
    </table></div>
    {toggling && <ActionDialog title={`${t(toggling.enabled ? 'adminConfirmTurnOffTitle' : 'adminConfirmTurnOnTitle')}: ${toggling.label}`} message={t(toggling.enabled ? 'adminConfirmTurnOffMessage' : 'adminConfirmTurnOnMessage')}
      confirmLabel={t(toggling.enabled ? 'adminTurnOff' : 'adminTurnOn')} tone={toggling.enabled ? 'danger' : 'primary'} isSubmitting={busy} error={error} onConfirm={() => void toggle()} onClose={() => setToggling(null)} />}
    {openedRow && <ManagersDialog row={openedRow} admins={admins} onClose={() => setOpened(null)} />}
  </>;
}

/** ผู้จัดการโมดูล of one module: add by search, remove with a confirm. Admins are listed as managers of everything. */
function ManagersDialog({ row, admins, onClose }: { row: ModuleSettingRow; admins: ModuleManager[]; onClose: () => void }) {
  const router = useRouter();
  const [person, setPerson] = useState<PickedPerson | null>(null);
  const [removing, setRemoving] = useState<ModuleManager | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = row.managerRole;

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
    if (!role || !removing) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/people/${encodeURIComponent(removing.personId)}/roles/${encodeURIComponent(role)}`, 'DELETE');
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setRemoving(null);
    router.refresh();
  }

  return <>
    <AdminFormDialog title={`${t('adminManagersOf')}: ${row.label}`} submitLabel={t('adminAddManager')} ready={Boolean(role && person)} isSubmitting={busy} error={removing ? null : error} onSubmit={() => void add()} onClose={onClose}>
      {role ? <>
        <p className="admin-muted">{t('adminManagerRole')}: {roleLabel(role)}</p>
        {row.managers.length === 0 ? <p>{t('adminNoManagers')}</p> : <ul className="admin-person-list">{row.managers.map((manager) => <li key={manager.personId}>
          <span>{manager.displayName ?? '—'}{manager.employeeCode ? <small> · {manager.employeeCode}</small> : null}{!manager.active ? <small> · {t('adminPersonInactive')}</small> : null}
            {roleNeedsHrDataOwner(role) && !manager.ownsHrData ? <small className="admin-warning">{t('adminNeedsHrDataOwner')}</small> : null}</span>
          <button type="button" className="button-secondary" aria-label={`${t('adminRemove')} ${manager.displayName ?? ''}`} onClick={() => { setError(null); setRemoving(manager); }}>{t('adminRemove')}</button>
        </li>)}</ul>}
        <PersonPicker person={person} onPick={setPerson} />
      </> : <p>{t('adminNoManagerRole')}</p>}
      <p className="admin-muted">{t('adminAdminsManageAll')}{admins.length > 0 ? `: ${admins.map((admin) => admin.displayName ?? '—').join(', ')}` : ''}</p>
    </AdminFormDialog>
    {removing && role && <ActionDialog title={`${t('adminConfirmRemoveTitle')}: ${roleLabel(role)}`} message={`${removing.displayName ?? '—'} — ${t('adminConfirmRemoveMessage')}`} confirmLabel={t('adminRemove')} tone="danger" isSubmitting={busy} error={error} onConfirm={() => void remove()} onClose={() => setRemoving(null)} />}
  </>;
}
