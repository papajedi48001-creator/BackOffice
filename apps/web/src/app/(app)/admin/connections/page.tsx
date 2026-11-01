import { t, type MessageKey } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { checkConnections, tcpProbe, type ConnectionCheck, type ConnectionKey } from '../../../../lib/connection-status';
import { readRuntimeValue } from '../../../../lib/runtime-env';
import { AdminMessage } from '../admin-message';

const names: Record<ConnectionKey, MessageKey> = { database: 'adminConnectionDatabase', redis: 'adminConnectionRedis', storage: 'adminConnectionStorage', scanner: 'adminConnectionScanner', mail: 'adminConnectionMail' };
const statuses: Record<ConnectionCheck['status'], { key: MessageKey; tone: string }> = { ok: { key: 'adminStatusOk', tone: 'approved' }, failed: { key: 'adminStatusFailed', tone: 'rejected' }, not_checked: { key: 'adminStatusNotChecked', tone: 'cancelled' } };

export const dynamic = 'force-dynamic';

/** ตั้งค่าการเชื่อมต่อ: read-only. Settings live in the server environment (docs/runbooks/deploy.md); no value is ever shown. */
export default async function AdminConnectionsPage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminConnectionsTitle" reason={context.reason} />;
  const rows = await checkConnections(readRuntimeValue, { database: async () => { await context.database.query('SELECT 1 AS ok'); }, tcp: (host, port) => tcpProbe(host, port) });
  return <section className="admin-page">
    <h2>{t('adminConnectionsTitle')}</h2>
    <p className="admin-note">{t('adminConnectionsNote')}</p>
    <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('adminConnectionName')}</th><th>{t('adminConnectionConfigured')}</th><th>{t('adminConnectionStatus')}</th><th>{t('adminConnectionDetail')}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}>
        <td>{t(names[row.key])}</td>
        <td>{t(row.configured ? 'adminConfigured' : 'adminNotConfigured')}</td>
        <td><span className={`status status-${statuses[row.status].tone}`}>{t(statuses[row.status].key)}</span></td>
        <td><code className="admin-variables">{row.variables.join(', ')}</code></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
