import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthorizationService, HrDirectory, canManagePeople } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { readSession } from '../../../../lib/session';

const one = (value: string | string[] | undefined) => ((Array.isArray(value) ? value[0] : value) ?? '').trim();
const choices = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'th'));

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const scope = new AuthorizationService().organizationScope(session, 'hr.person.read');
  if (scope !== 'all' && scope.length === 0) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const allPeople = await new HrDirectory(database).listPeople({ organizationIds: scope });
  const params = await searchParams;
  const query = one(params.q);
  const position = one(params.position);
  const employmentType = one(params.employmentType);
  const organization = one(params.organization);
  const needle = query.toLocaleLowerCase('th');
  const people = allPeople.filter((person) =>
    (!needle || [person.displayName, person.employeeCode].some((value) => value?.toLocaleLowerCase('th').includes(needle)))
    && (!position || person.positionTitle === position)
    && (!employmentType || person.employmentTypeName === employmentType)
    && (!organization || person.organizationName === organization));
  const filtered = Boolean(query || position || employmentType || organization);
  return (
    <section>
      <div className="page-heading"><h2>{t('peopleTitle')}</h2>{canManagePeople(session) ? <nav className="page-actions"><Link className="button-link" href="/hr/people/new">{t('hrAddPerson')}</Link></nav> : null}</div>
      {allPeople.length === 0 ? null : (
        <form role="search" aria-label={t('hrPeopleFilter')} className="leave-filter" method="get" action="/hr/people">
          <div className="form-field"><label htmlFor="people-q">{t('hrPeopleSearch')}</label><input id="people-q" name="q" type="search" placeholder={t('hrPeopleSearchHint')} defaultValue={query} /></div>
          <div className="form-field"><label htmlFor="people-position">{t('positionTitle')}</label><select id="people-position" name="position" defaultValue={position}><option value="">{t('hrAllPositions')}</option>{choices(allPeople.map((person) => person.positionTitle)).map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-field"><label htmlFor="people-type">{t('hrFieldEmploymentType')}</label><select id="people-type" name="employmentType" defaultValue={employmentType}><option value="">{t('hrAllEmploymentTypes')}</option>{choices(allPeople.map((person) => person.employmentTypeName)).map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-field"><label htmlFor="people-organization">{t('organization')}</label><select id="people-organization" name="organization" defaultValue={organization}><option value="">{t('hrAllOrganizations')}</option>{choices(allPeople.map((person) => person.organizationName)).map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-actions"><button type="submit">{t('hrPeopleApplyFilter')}</button>{filtered ? <Link href="/hr/people">{t('hrPeopleClearFilter')}</Link> : null}</div>
        </form>
      )}
      {allPeople.length === 0 ? <p>{t('noPeople')}</p> : people.length === 0 ? <p>{t('hrNoPeopleMatch')}</p> : (
        <table>
          <thead><tr><th>{t('employeeCode')}</th><th>{t('displayName')}</th><th>{t('positionTitle')}</th><th>{t('hrFieldEmploymentType')}</th><th>{t('organization')}</th><th>{t('nationalIdLabel')}</th><th>{t('employmentStatus')}</th></tr></thead>
          <tbody>{people.map((person) => (
            <tr key={person.id}>
              <td>{person.employeeCode ?? t('notAssigned')}</td>
              <td><Link href={`/hr/people/${person.id}`}>{person.displayName ?? t('notAssigned')}</Link></td>
              <td>{person.positionTitle ?? t('notAssigned')}</td>
              <td>{person.employmentTypeName ?? t('notAssigned')}</td>
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
