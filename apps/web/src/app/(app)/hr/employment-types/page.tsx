import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EmploymentTypeService, canManageEmploymentTypes } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { readSession } from '../../../../lib/session';
import { EmploymentTypeForm } from './employment-type-forms';

export default async function EmploymentTypesPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  if (!canManageEmploymentTypes(session)) return <section><h2>{t('hrEmploymentTypes')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('hrEmploymentTypes')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const types = await new EmploymentTypeService(database).list();
  const nextOrder = Math.max(0, ...types.map((type) => type.sortOrder)) + 1;
  return <section>
    <h2>{t('hrEmploymentTypes')}</h2>
    <div className="profile">
      {types.map((type) => <EmploymentTypeForm key={type.id} type={type} />)}
      <EmploymentTypeForm type={{ code: '', name: '', isActive: true, sortOrder: nextOrder }} />
    </div>
  </section>;
}
