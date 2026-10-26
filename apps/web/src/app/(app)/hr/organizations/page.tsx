import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthorizationService, HrDirectory, type DirectoryOrganization } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { headLabelKeys, unitTypeLabelKeys } from '../../../../lib/organization-unit-type';
import { readSession } from '../../../../lib/session';

export default async function OrganizationsPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const scope = new AuthorizationService().organizationScope(session, 'hr.person.read');
  if (scope !== 'all' && scope.length === 0) return <section><h2>{t('organizationsTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('organizationsTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const organizations = await new HrDirectory(database).listOrganizations();
  const ids = new Set(organizations.map((organization) => organization.id));
  const childrenOf = new Map<string | null, DirectoryOrganization[]>();
  for (const organization of organizations) {
    // A unit whose parent is missing is shown at the top level rather than hidden.
    const parentId = organization.parentId && ids.has(organization.parentId) ? organization.parentId : null;
    childrenOf.set(parentId, [...childrenOf.get(parentId) ?? [], organization]);
  }
  return <section><h2>{t('organizationsTitle')}</h2>{organizations.length === 0 ? <p>{t('noOrganizations')}</p> : <OrganizationTree parentId={null} childrenOf={childrenOf} />}</section>;
}

function OrganizationTree({ parentId, childrenOf }: { parentId: string | null; childrenOf: Map<string | null, DirectoryOrganization[]> }) {
  const children = childrenOf.get(parentId) ?? [];
  if (children.length === 0) return null;
  return (
    <ul className="organization-tree">
      {children.map((organization) => (
        <li key={organization.id}>
          <Link href={`/hr/organizations/${organization.id}`}>{organization.name}</Link>{organization.code ? <span className="organization-code"> ({organization.code})</span> : null}
          {organization.unitType ? <><span aria-hidden="true"> · </span><span className="organization-type">{t(unitTypeLabelKeys[organization.unitType])}</span></> : null}
          <span aria-hidden="true"> · </span>{organization.headDisplayName ? <span className="organization-head">{`${t(headLabelKeys(organization.unitType).head)} ${organization.headDisplayName}`}</span> : <span className="organization-no-head">{t(headLabelKeys(organization.unitType).none)}</span>}
          {organization.headPersonId && !organization.headActive ? <><span aria-hidden="true"> · </span><span className="organization-no-head">{t(headLabelKeys(organization.unitType).inactive)}</span></> : null}
          <span aria-hidden="true"> · </span><span className="organization-count">{`${t('activePeople')} ${organization.activePeople} คน`}</span>
          <OrganizationTree parentId={organization.id} childrenOf={childrenOf} />
        </li>
      ))}
    </ul>
  );
}
