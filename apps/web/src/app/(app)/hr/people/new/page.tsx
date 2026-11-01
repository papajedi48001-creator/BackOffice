import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { EmploymentTypeService, HrDirectory, PositionCatalogService, canManagePeople } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { NewPersonForm } from '../../../../../components/hr-account-forms';
import { getSharedDatabase } from '../../../../../lib/database';
import { readSession } from '../../../../../lib/session';

/** HR adds a บุคลากร with a บัญชีผู้ใช้. Only a hospital-wide HR manager may; the API checks again. */
export default async function NewPersonPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  const back = <p><Link href="/hr/people">{t('hrBackToPeople')}</Link></p>;
  if (!canManagePeople(session)) return <section>{back}<h2>{t('hrNewPersonTitle')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section>{back}<h2>{t('hrNewPersonTitle')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const employmentTypes = (await new EmploymentTypeService(database).list()).filter((type) => type.isActive).map(({ id, name }) => ({ id, name }));
  const positions = (await new PositionCatalogService(database).list()).filter((position) => position.isActive).map(({ name, allowedLevels }) => ({ name, allowedLevels }));
  const units = (await new HrDirectory(database).listOrganizations()).map(({ id, name, unitType, parentId }) => ({ id, name, unitType, parentId }));
  return <section>
    {back}
    <h2>{t('hrNewPersonTitle')}</h2>
    <NewPersonForm employmentTypes={employmentTypes} units={units} positions={positions} />
  </section>;
}
