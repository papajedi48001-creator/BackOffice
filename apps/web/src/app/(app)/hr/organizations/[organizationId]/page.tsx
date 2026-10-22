import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AuthorizationService, HrDirectory } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { bangkokToday, formatBangkokDate } from '../../../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../../../lib/database';
import { unitTypeLabelKeys } from '../../../../../lib/organization-unit-type';
import { readSession } from '../../../../../lib/session';
import { OrganizationForms } from './organization-forms';

const formatDay = (instant: string) => formatBangkokDate(bangkokToday(new Date(instant)));

export default async function OrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const authorization = new AuthorizationService();
  const scope = authorization.organizationScope(session, 'hr.person.read');
  if (scope !== 'all' && scope.length === 0) return <section><h2>{t('organizationsTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('organizationsTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const directory = new HrDirectory(database);
  const organization = await directory.getOrganization(organizationId);
  if (!organization) notFound();
  const canManage = authorization.canActHospitalWide(session, 'hr.organization.manage', 'hr');
  const people = canManage
    ? (await directory.listPeople({ organizationIds: 'all' })).filter((person) => person.employmentStatus === 'ACTIVE').map((person) => ({ id: person.id, label: `${person.employeeCode ?? ''} ${person.displayName ?? ''}`.trim() }))
    : [];
  const current = organization.headHistory.find((term) => term.personId === organization.headPersonId);
  const personLabel = (term: { displayName: string | null; employeeCode: string | null }) => `${term.displayName ?? ''}${term.employeeCode ? ` (${term.employeeCode})` : ''}`;

  return <section>
    <p><Link href="/hr/organizations">{t('hrBackToOrganizations')}</Link></p>
    <h2>{organization.name}</h2>
    <dl className="organization-summary">
      <dt>{t('hrUnitType')}</dt><dd>{organization.unitType ? t(unitTypeLabelKeys[organization.unitType]) : t('hrUnitTypeNone')}</dd>
      <dt>{t('hrOrganizationHead')}</dt><dd>{current ? personLabel(current) : <span className="organization-no-head">{t('hrNoHead')}</span>}{current && !organization.headActive ? <> <span className="organization-no-head">{t('hrHeadInactive')}</span></> : null}</dd>
    </dl>
    {canManage ? <OrganizationForms organizationId={organization.id} unitType={organization.unitType} people={people} today={bangkokToday()} /> : null}
    <h3>{t('hrHeadHistory')}</h3>
    {organization.headHistory.length === 0 ? <p>{t('hrNoHeadHistory')}</p> : <table>
      <thead><tr><th>{t('hrOrganizationHead')}</th><th>{t('hrHeadTermFrom')}</th><th>{t('hrHeadTermUntil')}</th></tr></thead>
      <tbody>{organization.headHistory.map((term) => <tr key={`${term.personId}-${term.effectiveFrom}`}><td>{personLabel(term)}</td><td>{formatDay(term.effectiveFrom)}</td><td>{term.effectiveUntil ? formatDay(term.effectiveUntil) : t('hrHeadTermCurrent')}</td></tr>)}</tbody>
    </table>}
  </section>;
}
