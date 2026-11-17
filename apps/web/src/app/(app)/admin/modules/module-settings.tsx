'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { moduleAccentPalette, moduleIconNames, type ModuleAppearance, type ModuleMode } from '@backoffice/contracts';
import { t, type MessageKey } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { ModuleIcon, moduleIconLabel } from '../../../../components/module-icon';
import { roleLabel, sendAdmin } from '../../../../lib/admin-labels';
import type { ModuleIconName } from '../../../../lib/modules';
import { PersonPicker, type PickedPerson } from '../person-picker';

export interface ModuleManager { personId: string; displayName: string | null; employeeCode: string | null; ownsHrData: boolean; active: boolean }
/** `icon` is the one shown now; `defaultIcon` the registry's; `appearance` what ตั้งค่าโปรแกรม chose (null = default). */
export interface ModuleSettingRow { code: string; label: string; description: string; icon: ModuleIconName; defaultIcon: ModuleIconName; appearance: ModuleAppearance; mode: ModuleMode; locked: boolean; managerRole: string | null; managers: ModuleManager[]; testerRole: string | null; testers: ModuleManager[] }

/** The three modes in the order the control shows them. */
const modes: Array<{ mode: ModuleMode; labelKey: MessageKey; statusClass: string }> = [
  { mode: 'ON', labelKey: 'adminModeOn', statusClass: 'approved' },
  { mode: 'DEVELOPMENT', labelKey: 'adminModeDevelopment', statusClass: 'pending' },
  { mode: 'OFF', labelKey: 'adminModeOff', statusClass: 'cancelled' }
];
const modeLabel = (mode: ModuleMode) => t(modes.find((entry) => entry.mode === mode)!.labelKey);
/** "ผู้จัดการ n · ผู้ทดสอบ n", leaving out a role the module does not have; null when it has neither. */
function headcount(row: ModuleSettingRow): string | null {
  const parts = [row.managerRole ? `${t('adminKindManager')} ${row.managers.length}` : null, row.testerRole ? `${t('adminRoleTester')} ${row.testers.length}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
const confirmKeys: Record<ModuleMode, MessageKey> = { ON: 'adminConfirmModeOnMessage', DEVELOPMENT: 'adminConfirmModeDevelopmentMessage', OFF: 'adminConfirmModeOffMessage' };

/** The module list: a three-way เปิด/พัฒนา/ปิด control per module (confirmed in a popup) and, on the module's name, a popup of its ผู้จัดการ and ผู้ทดสอบ. */
export function ModuleSettings({ rows, admins }: { rows: ModuleSettingRow[]; admins: ModuleManager[] }) {
  const router = useRouter();
  const [toggling, setToggling] = useState<{ row: ModuleSettingRow; mode: ModuleMode } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedRow = rows.find((row) => row.code === opened) ?? null;
  const paintingRow = rows.find((row) => row.code === painting) ?? null;

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
      <tbody>{rows.map((row) => { const count = headcount(row); const countId = `module-headcount-${row.code}`; return <tr key={row.code} data-module={row.code}>
        <td><div className="module-name-cell"><span className="module-chip" aria-hidden="true"><ModuleIcon name={row.icon} /></span><span>
          <button type="button" className="module-name-link" aria-describedby={count ? countId : undefined} onClick={() => setOpened(row.code)}>{row.label}</button>
          {count ? <span id={countId} className="module-headcount">{count}</span> : null}
          <small className="admin-muted">{row.description}</small></span></div></td>
        <td>{row.managerRole ? (row.managers.length === 0 ? <span className="admin-muted">{t('adminNoManagers')}</span> : row.managers.map((manager) => manager.displayName ?? '—').join(', ')) : <span className="admin-muted">{t('adminRoleAdmin')}</span>}</td>
        <td><span className={`status status-${modes.find((entry) => entry.mode === row.mode)!.statusClass}`}>{modeLabel(row.mode)}</span></td>
        <td className="request-actions"><button type="button" className="module-paint" aria-label={`${t('adminModuleAppearance')} ${row.label}`} title={t('adminModuleAppearance')} onClick={() => setPainting(row.code)}><PaletteIcon /></button>{row.locked
          ? <span className="admin-muted">{t('adminModuleLocked')}</span>
          : <div className="mode-switch" role="group" aria-label={`${t('adminModeOf')} ${row.label}`}>{modes.map((entry) => <button key={entry.mode} type="button" data-mode={entry.mode} aria-pressed={row.mode === entry.mode} disabled={row.mode === entry.mode} onClick={() => { setError(null); setToggling({ row, mode: entry.mode }); }}>{t(entry.labelKey)}</button>)}</div>}</td>
      </tr>; })}</tbody>
    </table></div>
    {toggling && <ActionDialog title={`${t('adminConfirmModeTitle')}: ${toggling.row.label}`} message={`${modeLabel(toggling.row.mode)} → ${modeLabel(toggling.mode)} — ${t(confirmKeys[toggling.mode])}`}
      confirmLabel={`${t('adminChangeModeTo')}${modeLabel(toggling.mode)}`} tone={toggling.mode === 'OFF' ? 'danger' : 'primary'} isSubmitting={busy} error={error} onConfirm={() => void toggle()} onClose={() => setToggling(null)} />}
    {openedRow && <ManagersDialog row={openedRow} admins={admins} onClose={() => setOpened(null)} />}
    {paintingRow && <AppearanceDialog key={paintingRow.code} row={paintingRow} onClose={() => setPainting(null)} />}
  </>;
}

function PaletteIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.56C22 6 17.5 2 12 2" /></svg>;
}


/**
 * สีและไอคอน of one module: palette swatches and icons as radio groups, each with "เดิม" (the default) first, and a live preview of
 * the sidebar item and the หน้าหลัก tile. `data-default-accent` keeps the module's own colour on the "เดิม" swatch and preview.
 */
function AppearanceDialog({ row, onClose }: { row: ModuleSettingRow; onClose: () => void }) {
  const router = useRouter();
  const [color, setColor] = useState<ModuleAppearance['color']>(row.appearance.color);
  const [icon, setIcon] = useState<ModuleAppearance['icon']>(row.appearance.icon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = icon ?? row.defaultIcon;
  const tone = color ? { style: { '--accent': color } as React.CSSProperties } : { 'data-default-accent': '' };

  async function save(): Promise<boolean> {
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/modules/${encodeURIComponent(row.code)}/appearance`, 'PUT', { color, icon });
    setBusy(false);
    if (sent.error) { setError(sent.error); return false; }
    router.refresh();
    return true;
  }

  return <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} title={`${t('adminModuleAppearance')}: ${row.label}`} submitLabel={t('adminSave')} isSubmitting={busy} error={error} onSubmit={() => save()}>
    <div className="appearance-body" data-module={row.code} {...tone}>
    <div className="appearance-preview" aria-label={t('adminAppearancePreview')} role="group">
      <span className="appearance-preview-side"><span className="nav-icon" aria-hidden="true"><ModuleIcon name={shown} /></span>{row.label}</span>
      <span className="appearance-preview-tile">{row.label}<span className="appearance-preview-mark" aria-hidden="true"><ModuleIcon name={shown} /></span></span>
    </div>
    <fieldset className="appearance-choices appearance-colors">
      <legend>{t('adminAppearanceColor')}</legend>
      <label className="appearance-swatch is-default" data-module={row.code} data-default-accent="" title={t('adminAppearanceColorDefault')}><input type="radio" name="appearance-color" aria-label={t('adminAppearanceColorDefault')} checked={color === null} onChange={() => setColor(null)} /><span>{t('adminAppearanceDefault')}</span></label>
      {moduleAccentPalette.map((swatch) => <label key={swatch} className="appearance-swatch" style={{ '--swatch': swatch } as React.CSSProperties} title={swatch}><input type="radio" name="appearance-color" aria-label={`${t('adminAppearanceColorOne')} ${swatch}`} checked={color === swatch} onChange={() => setColor(swatch)} /></label>)}
    </fieldset>
    <fieldset className="appearance-choices appearance-icons">
      <legend>{t('adminAppearanceIcon')}</legend>
      <label className="appearance-icon is-default" title={t('adminAppearanceIconDefault')}><input type="radio" name="appearance-icon" aria-label={t('adminAppearanceIconDefault')} checked={icon === null} onChange={() => setIcon(null)} /><ModuleIcon name={row.defaultIcon} /><span>{t('adminAppearanceDefault')}</span></label>
      {moduleIconNames.map((name) => <label key={name} className="appearance-icon" title={moduleIconLabel(name)}><input type="radio" name="appearance-icon" aria-label={`${t('adminAppearanceIcon')} ${moduleIconLabel(name)}`} checked={icon === name} onChange={() => setIcon(name)} /><ModuleIcon name={name} /></label>)}
    </fieldset>
    </div>
  </FormDialog>;
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
      <span>{holder.displayName ?? '—'}{holder.employeeCode ? <small> · {holder.employeeCode}</small> : null}{!holder.active ? <small> · {t('adminPersonInactive')}</small> : null}</span>
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
