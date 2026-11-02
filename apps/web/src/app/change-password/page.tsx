import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { ChangePasswordForm } from '../../components/change-password-form';
import { readPendingPasswordChange, readSession } from '../../lib/session';

/** เปลี่ยนรหัสผ่าน: the forced step after a reset, or a signed-in person changing their own password. */
export default async function ChangePasswordPage() {
  const request = new Request('http://localhost', { headers: await headers() });
  const session = await readSession(request);
  const pending = session ? null : await readPendingPasswordChange(request);
  if (!session && !pending) {
    redirect('/');
    return null;
  }
  return <main className="welcome-shell">
    <section className="welcome-panel" aria-label={t('passwordChangeTitle')}>
      <p className="eyebrow">โรงพยาบาลวาริชภูมิ</p>
      <ChangePasswordForm forced={pending !== null} />
    </section>
  </main>;
}
