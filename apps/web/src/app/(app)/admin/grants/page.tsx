import { t } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { AdminMessage } from '../admin-message';
import { GrantsManager } from './grants-manager';

export const dynamic = 'force-dynamic';

/** กำหนดสิทธิ: every ผู้ดูแลระบบ and ผู้จัดการโมดูล grant, one row per person. */
export default async function AdminGrantsPage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminGrantsTitle" reason={context.reason} />;
  const grants = await context.queries.grants();
  return <section className="admin-page">
    <h2>{t('adminGrantsTitle')}</h2>
    <p className="admin-note">{t('adminGrantsCopy')}</p>
    <GrantsManager grants={grants} currentPersonId={context.session.personId} />
  </section>;
}
