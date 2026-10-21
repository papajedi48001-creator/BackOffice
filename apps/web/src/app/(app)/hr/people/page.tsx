import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthorizationService, HrDirectory } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { readSession } from '../../../../lib/session';

export default async function PeoplePage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const scope = new AuthorizationService().organizationScope(session, 'hr.person.read');
  if (scope !== 'all' && scope.length === 0) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const people = await new HrDirectory(database).listPeople({ organizationIds: scope });
  return (
    <section>
      <h2>{t('peopleTitle')}</h2>
      {people.length === 0 ? <p>{t('noPeople')}</p> : (
        <table>
          <thead><tr><th>{t('employeeCode')}</th><th>{t('displayName')}</th><th>{t('positionTitle')}</th><th>{t('organization')}</th><th>{t('nationalIdLabel')}</th><th>{t('employmentStatus')}</th></tr></thead>
          <tbody>{people.map((person) => (
            <tr key={person.id}>
              <td>{person.employeeCode ?? t('notAssigned')}</td>
              <td>{person.displayName ?? t('notAssigned')}</td>
              <td>{person.positionTitle ?? t('notAssigned')}</td>
              <td>{person.organizationName ?? t('notAssigned')}</td>
              <td>{person.nationalIdMasked ?? t('notAssigned')}</td>
              <td>{person.employmentStatus === 'ACTIVE' ? t('employmentActive') : t('employmentInactive')}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
