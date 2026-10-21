import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthorizationService } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { readSession } from '../../../../lib/session';
import { MasterDataImportForm } from './master-data-import-form';

export default async function MasterDataImportPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const allowed = new AuthorizationService().canActHospitalWide(session, 'hr.person.manage', 'hr');
  return <section><h2>{t('hrImportTitle')}</h2>{allowed ? <MasterDataImportForm /> : <p role="alert">{t('hrNoAccess')}</p>}</section>;
}
