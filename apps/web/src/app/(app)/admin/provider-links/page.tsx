import { DatabaseExternalIdentityRepository } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { providerSsoConfig } from '../../../../lib/provider-sso';
import { AdminMessage } from '../admin-message';
import { ProviderLinksManager } from './provider-links-manager';

export const dynamic = 'force-dynamic';

/** บัญชี Provider ID: ผูกบัญชีที่รอผูกกับบุคลากร และยกเลิกการผูก. */
export default async function AdminProviderLinksPage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminProviderTitle" reason={context.reason} />;
  const config = await providerSsoConfig();
  if (!config) return <section className="admin-page"><h2>{t('adminProviderTitle')}</h2><p className="admin-note">{t('adminProviderNotConfigured')}</p></section>;
  const repository = new DatabaseExternalIdentityRepository(context.database);
  const [pending, links] = await Promise.all([repository.listPending(), repository.listLinks(config.apiUrl)]);
  return <section className="admin-page">
    <h2>{t('adminProviderTitle')}</h2>
    <p className="admin-note">{t('adminProviderCopy')}</p>
    <ProviderLinksManager
      pending={pending.map((row) => ({ id: row.id, displayName: row.displayName, lastSeenAt: new Date(row.lastSeenAt).toISOString() }))}
      links={links.map((row) => ({ personId: row.personId, personName: row.personName, displayName: row.displayName, linkedAt: new Date(row.linkedAt).toISOString(), linkedByAdmin: row.linkedByPersonId !== null }))} />
  </section>;
}
