'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LineGroupRow } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { ActionDialog } from '../../../../components/action-dialog';
import { FormDialog } from '../../../../components/form-dialog';
import { sendAdmin } from '../../../../lib/admin-labels';

export interface LineModuleRow { code: string; label: string; groupId: string | null }

const groupLabel = (group: LineGroupRow | undefined, groupId: string) => group?.displayName ?? groupId;

/** แจ้งเตือน LINE: the groups the bot knows, each module's กลุ่มแจ้งเตือน (set in a popup) and a test message per group. */
export function LineSettings({ groups, modules }: { groups: LineGroupRow[]; modules: LineModuleRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LineModuleRow | null>(null);
  const [choice, setChoice] = useState('');
  const [testing, setTesting] = useState<LineGroupRow | null>(null);
  const [newGroup, setNewGroup] = useState({ groupId: '', displayName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const byId = new Map(groups.map((group) => [group.groupId, group]));
  const active = groups.filter((group) => group.active);

  async function saveRoute(): Promise<boolean> {
    if (!editing) return false;
    setError(null);
    const sent = await sendAdmin(`/api/admin/line/routes/${encodeURIComponent(editing.code)}`, 'PUT', { groupId: choice || null });
    if (sent.error) { setError(sent.error); return false; }
    setEditing(null);
    router.refresh();
    return true;
  }
  async function addGroup(): Promise<boolean> {
    setError(null);
    const sent = await sendAdmin('/api/admin/line/groups', 'POST', { groupId: newGroup.groupId.trim(), displayName: newGroup.displayName.trim() });
    if (sent.error) { setError(sent.error); return false; }
    setNewGroup({ groupId: '', displayName: '' });
    router.refresh();
    return true;
  }
  async function sendTest() {
    if (!testing) return;
    setBusy(true); setError(null);
    const sent = await sendAdmin(`/api/admin/line/groups/${encodeURIComponent(testing.groupId)}/test`, 'POST');
    setBusy(false);
    if (sent.error) { setError(sent.error); return; }
    setTesting(null);
    setNotice(t('adminLineTestSent'));
  }

  return <>
    {notice && <p role="status" className="admin-note">{notice}</p>}
    <h3>{t('adminLineRoutes')}</h3>
    <div className="leave-table-scroll"><table aria-label={t('adminLineRoutes')}>
      <thead><tr><th>{t('adminModule')}</th><th>{t('adminLineGroup')}</th><th></th></tr></thead>
      <tbody>{modules.map((row) => <tr key={row.code}>
        <td>{row.label}</td>
        <td>{row.groupId ? <>{groupLabel(byId.get(row.groupId), row.groupId)}{byId.get(row.groupId)?.active === false ? <small className="admin-muted"> ({t('adminLineLeft')})</small> : null}</> : <span className="admin-muted">{t('adminLineRouteNone')}</span>}</td>
        <td className="request-actions"><button type="button" className="button-secondary" aria-label={`${t('adminLineRouteEdit')} ${row.label}`} onClick={() => { setError(null); setChoice(row.groupId ?? ''); setEditing(row); }}>{t('editItem')}</button></td>
      </tr>)}</tbody>
    </table></div>

    <div className="page-heading"><h3>{t('adminLineGroups')}</h3>
      <FormDialog title={t('adminLineAddGroup')} triggerLabel={t('adminLineAddGroup')} triggerClassName="button-secondary" submitLabel={t('adminSave')} error={error} ready={Boolean(newGroup.groupId.trim() && newGroup.displayName.trim())} onSubmit={() => addGroup()}>
        <p className="admin-note">{t('adminLineAddGroupHint')}</p>
        <label>{t('adminLineGroupId')}<input value={newGroup.groupId} required pattern="C[0-9a-f]{32}" onChange={(event) => setNewGroup({ ...newGroup, groupId: event.target.value })} /></label>
        <label>{t('adminLineGroupName')}<input value={newGroup.displayName} required maxLength={120} onChange={(event) => setNewGroup({ ...newGroup, displayName: event.target.value })} /></label>
      </FormDialog>
    </div>
    {groups.length === 0 ? <p className="admin-muted">{t('adminLineNoGroups')}</p> : <div className="leave-table-scroll"><table aria-label={t('adminLineGroups')}>
      <thead><tr><th>{t('adminLineGroupName')}</th><th>{t('adminLineGroupId')}</th><th>{t('adminLineSource')}</th><th>{t('status')}</th><th></th></tr></thead>
      <tbody>{groups.map((group) => <tr key={group.groupId}>
        <td>{group.displayName ?? '—'}</td>
        <td><code className="admin-variables">{group.groupId}</code></td>
        <td>{t(group.source === 'MANUAL' ? 'adminLineSourceManual' : 'adminLineSourceWebhook')}</td>
        <td><span className={`status status-${group.active ? 'approved' : 'cancelled'}`}>{t(group.active ? 'adminLineActive' : 'adminLineLeft')}</span></td>
        <td className="request-actions">{group.active && <button type="button" className="button-secondary" aria-label={`${t('adminLineTestTo')} ${groupLabel(group, group.groupId)}`} onClick={() => { setError(null); setNotice(null); setTesting(group); }}>{t('adminLineTest')}</button>}</td>
      </tr>)}</tbody>
    </table></div>}

    {editing && <FormDialog open onOpenChange={(open) => { if (!open) setEditing(null); }} title={`${t('adminLineRouteFor')}: ${editing.label}`} submitLabel={t('adminSave')} error={error} onSubmit={() => saveRoute()}>
      <label>{t('adminLineGroup')}<select value={choice} onChange={(event) => setChoice(event.target.value)}>
        <option value="">{t('adminLineRouteNone')}</option>
        {active.map((group) => <option key={group.groupId} value={group.groupId}>{groupLabel(group, group.groupId)}</option>)}
      </select></label>
    </FormDialog>}
    {testing && <ActionDialog title={`${t('adminLineTest')}: ${groupLabel(testing, testing.groupId)}`} message={t('adminLineTestMessage')} confirmLabel={t('adminLineTest')} isSubmitting={busy} error={error} onConfirm={() => void sendTest()} onClose={() => setTesting(null)} />}
  </>;
}
