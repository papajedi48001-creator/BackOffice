import { t, type MessageKey } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { roleLabel } from '../../../../lib/admin-labels';
import { formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { moduleLabel } from '../../../../lib/modules';
import { AdminMessage } from '../admin-message';

export const dynamic = 'force-dynamic';

const modeKeys: Record<string, MessageKey> = { ON: 'adminModeOn', DEVELOPMENT: 'adminModeDevelopment', OFF: 'adminModeOff' };
const modeName = (mode: string) => (modeKeys[mode] ? t(modeKeys[mode]) : mode);
const actionKeys = { 'admin.module.enabled': 'auditAdminModuleEnabled', 'admin.module.disabled': 'auditAdminModuleDisabled', 'admin.module.mode_changed': 'auditAdminModuleModeChanged', 'admin.role.granted': 'auditAdminRoleGranted', 'admin.role.revoked': 'auditAdminRoleRevoked' } as const;

/** บันทึกของผู้ดูแล: every admin.* audit event by anyone, newest first, shown in Bangkok time. */
export default async function AdminAuditPage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminAuditTitle" reason={context.reason} />;
  const rows = await context.queries.audit();
  return <section className="admin-page">
    <h2>{t('adminAuditTitle')}</h2>
    <p className="admin-note">{t('adminAuditCopy')}</p>
    {rows.length === 0 ? <p>{t('adminNoAudit')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('auditTime')}</th><th>{t('adminAuditActor')}</th><th>{t('auditAction')}</th><th>{t('adminAuditTarget')}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td>{formatBangkokDateTime(row.createdAt)}</td>
        <td>{row.actorName ?? '—'}</td>
        <td>{row.action in actionKeys ? t(actionKeys[row.action as keyof typeof actionKeys]) : row.action}</td>
        <td>{row.moduleCode ? `${moduleLabel(row.moduleCode)}${row.fromMode && row.toMode ? ` · ${modeName(row.fromMode)} → ${modeName(row.toMode)}` : ''}` : `${row.targetName ?? '—'}${row.roleName ? ` · ${roleLabel(row.roleName)}` : ''}`}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
