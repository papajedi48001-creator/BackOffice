import { lineAlertModuleCodes } from '@backoffice/contracts';
import { LineService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { lineSettings } from '../../../../lib/line-api';
import { moduleLabel } from '../../../../lib/modules';
import { AdminMessage } from '../admin-message';
import { LineSettings } from './line-settings';

export const dynamic = 'force-dynamic';

/** แจ้งเตือน LINE (ผู้ดูแลระบบ): whether LINE is set up (never the values), the webhook path, the groups and each module's group. */
export default async function AdminLinePage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminLineTitle" reason={context.reason} />;
  const overview = await new LineService(context.database).overview();
  const settings = lineSettings();
  const configured = Boolean(settings.accessToken && settings.channelSecret);
  return <section className="admin-page">
    <h2>{t('adminLineTitle')}</h2>
    <p className="admin-note">{t('adminLineNote')}</p>
    <dl className="admin-line-facts">
      <div><dt>{t('adminConnectionLine')}</dt><dd><span className={`status status-${configured ? 'approved' : 'cancelled'}`}>{t(configured ? 'adminConfigured' : 'adminNotConfigured')}</span></dd></div>
      <div><dt>{t('adminLineWebhook')}</dt><dd><code className="admin-variables">https://&lt;โดเมน tunnel&gt;/api/line/webhook</code><small className="admin-muted">{t('adminLineWebhookHint')}</small></dd></div>
      <div><dt>{t('adminLineLinked')}</dt><dd>{overview.linkedCount}</dd></div>
    </dl>
    <LineSettings groups={overview.groups} modules={lineAlertModuleCodes.map((code) => ({ code, label: moduleLabel(code), groupId: overview.routes[code] ?? null }))} />
  </section>;
}
