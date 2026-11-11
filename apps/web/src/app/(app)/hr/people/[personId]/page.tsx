import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AuthorizationService, EmploymentTypeService, HrDirectory, HrProfileService, PositionCatalogService, canManagePeople, isAdmin, localAccountOf } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { AccountForm, DeletePersonButton, IdentityForm } from '../../../../../components/hr-account-forms';
import { HrProfileView } from '../../../../../components/hr-profile-view';
import { attachmentsEnabled } from '../../../../../lib/attachments';
import { getSharedDatabase } from '../../../../../lib/database';
import { profilePhotoUrl } from '../../../../../lib/profile-photo';
import { readSession } from '../../../../../lib/session';

export default async function PersonProfilePage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const view = await new HrProfileService(database).get(personId, session);
  if (view === 'NOT_FOUND') notFound();
  if (view === 'FORBIDDEN') return <section><h2>{t('peopleTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  let employmentTypes: { id: string; name: string }[] = [];
  let positions: { name: string; allowedLevels: string[] }[] = [];
  let units: { id: string; name: string; unitType: string | null; parentId: string | null }[] = [];
  if (view.access.editProfile) {
    // Active types, plus a retired type the person still holds so the form keeps it.
    employmentTypes = (await new EmploymentTypeService(database).list()).filter((type) => type.isActive || type.id === view.work.employmentTypeId);
    const scope = new AuthorizationService().organizationScope(session, 'hr.person.manage');
    // Open positions, plus a closed one the person still holds so its levels are still offered.
    positions = (await new PositionCatalogService(database).list()).filter((position) => position.isActive || position.name === view.work.positionTitle).map(({ name, allowedLevels }) => ({ name, allowedLevels }));
    const all = await new HrDirectory(database).listOrganizations();
    const inScope = all.filter((organization) => scope === 'all' || scope.includes(organization.id));
    // A scoped manager also sees the กลุ่มงาน above their งาน, so the งาน can be found by its กลุ่มงาน; the server still checks the unit saved.
    const parents = new Set(inScope.map((organization) => organization.parentId));
    units = all.filter((organization) => inScope.includes(organization) || (organization.unitType === 'DIVISION' && parents.has(organization.id)))
      .map(({ id, name, unitType, parentId }) => ({ id, name, unitType, parentId }));
  }
  // Only a hospital-wide HR manager edits identity and accounts; the API checks again. getAccount reads the username only.
  const managesPeople = canManagePeople(session);
  // A ผู้ดูแลระบบ may also reset passwords (รีเซ็ตรหัสผ่าน); the service decides whose.
  const resetsPasswords = managesPeople || isAdmin(session);
  const account = resetsPasswords ? await localAccountOf(database, personId) : null;
  return <section>
    <p><Link href="/hr/people">{t('hrBackToPeople')}</Link></p>
    <h2>{view.work.displayName ?? view.work.employeeCode ?? t('notAssigned')}</h2>
    <HrProfileView view={view} contactEndpoint={`/api/hr/people/${personId}/contact`} employmentTypes={employmentTypes} units={units} positions={positions} uploadsEnabled={attachmentsEnabled()} personPhoto={{ url: attachmentsEnabled() && view.work.photoAttachmentId ? profilePhotoUrl(personId, view.work.photoAttachmentId) : null, uploadsEnabled: attachmentsEnabled() }} />
    {managesPeople ? <IdentityForm personId={personId} values={{ employeeCode: view.work.employeeCode, employmentStatus: view.work.employmentStatus }} username={account?.username ?? null} /> : null}
    {resetsPasswords ? <AccountForm personId={personId} username={account?.username ?? null} self={personId === session.personId} /> : null}
    {resetsPasswords && personId !== session.personId ? <DeletePersonButton personId={personId} name={view.work.displayName ?? view.work.employeeCode ?? t('notAssigned')} /> : null}
  </section>;
}
