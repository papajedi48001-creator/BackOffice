import { t } from '@backoffice/i18n';
import { adminPage } from '../../../../lib/admin-page';
import { signInSettings } from '../../../../lib/sign-in-settings';
import { AdminMessage } from '../admin-message';
import { SignInSettings } from './sign-in-settings';

export const dynamic = 'force-dynamic';

/** The public address staff use; the redirect URIs to register with DOPA and MOPH ID hang off it. */
const defaultThaidRedirectUri = 'https://office-waritch-hosp.moph.go.th/api/auth/thaid/callback';

/** ผู้ดูแลระบบ > การเข้าสู่ระบบ: ThaID and Provider ID clients. No secret is ever sent to the browser. */
export default async function AdminSignInPage() {
  const context = await adminPage();
  if (!context.ok) return <AdminMessage titleKey="adminSignInTitle" reason={context.reason} />;
  const view = await signInSettings(context.database).view();
  return <section className="admin-page">
    <h2>{t('adminSignInTitle')}</h2>
    <p className="admin-note">{t('adminSignInCopy')}</p>
    <SignInSettings view={view} defaultThaidRedirectUri={defaultThaidRedirectUri} />
  </section>;
}
