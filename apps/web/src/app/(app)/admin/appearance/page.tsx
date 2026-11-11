import { SiteImageService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { AdminMessage } from '../admin-message';
import { LoginPhotoSettings } from './login-photo-settings';

export const dynamic = 'force-dynamic';

/** หน้าตาระบบ: pictures the ผู้ดูแลระบบ sets for the whole site (now the hospital photo on the sign-in page). */
export default async function AdminAppearancePage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminAppearanceTitle" reason={context.reason} />;
  const version = await new SiteImageService(context.database).version('login-hero');
  return <section className="admin-page">
    <h2>{t('adminAppearanceTitle')}</h2>
    <LoginPhotoSettings version={version} />
  </section>;
}
