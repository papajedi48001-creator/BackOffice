import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { roleChoiceDescription, roleChoiceName } from '../../lib/role-choice-labels';
import { readSession } from '../../lib/session';
import { RolePicker } from './role-picker';

/** เลือกบทบาท: shown after sign-in to a person with two or more roles, and again from "เปลี่ยนบทบาท" in the profile menu. */
export default async function ChooseRolePage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated) redirect('/');
  const held = session.roleChoices ?? [];
  if (held.length < 2) redirect('/dashboard');
  const choices = [...held, 'employee'].map((code) => ({ code, name: roleChoiceName(code), description: roleChoiceDescription(code) }));
  return <main className="welcome-shell">
    <section className="welcome-panel role-picker-panel" aria-labelledby="choose-role-title">
      <p className="eyebrow">{t('hospitalName')}</p>
      <h1 id="choose-role-title">{t('chooseRoleTitle')}</h1>
      <p>{t('chooseRoleIntro')}</p>
      <RolePicker choices={choices} current={session.activeRole ?? null} />
    </section>
  </main>;
}
