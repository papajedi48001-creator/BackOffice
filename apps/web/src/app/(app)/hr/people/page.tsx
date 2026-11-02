import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthorizationService, HrDirectory, canManagePeople } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { readSession } from '../../../../lib/session';
import { PeopleTable } from '../../../../components/people-table';

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
      <div className="page-heading"><h2>{t('peopleTitle')}</h2>{canManagePeople(session) ? <nav className="page-actions"><Link className="button-link" href="/hr/people/new">{t('hrAddPerson')}</Link></nav> : null}</div>
      {people.length === 0 ? <p>{t('noPeople')}</p> : <PeopleTable people={people} />}
    </section>
  );
}
