import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { t } from '@backoffice/i18n';
import { readSession } from '../../../../../lib/session';
import { PersonEditor } from './person-editor';

export default async function PersonProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const editor = await PersonEditor({ personId, session });
  if (editor === 'NO_DATABASE') return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  if (editor === 'NOT_FOUND') notFound();
  if (editor === 'FORBIDDEN') return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  return <section>
    <p><Link href="/hr/people">{t('hrBackToPeople')}</Link></p>
    <h2>{editor.title}</h2>
    {editor.body}
  </section>;
}
