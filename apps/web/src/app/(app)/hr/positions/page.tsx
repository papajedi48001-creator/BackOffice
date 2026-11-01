import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { PositionCatalogService, canManagePositions } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { categoryLabelKeys, levelRange } from '../../../../lib/position-labels';
import { readSession } from '../../../../lib/session';
import { PositionForm, PositionImportForm } from './position-forms';

export default async function PositionsPage() {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.personId) {
    redirect('/');
    return null;
  }
  if (!canManagePositions(session)) return <section><h2>{t('hrPositions')}</h2><p role="alert">{t('hrNoAccess')}</p></section>;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('hrPositions')}</h2><p role="alert">{t('hrLoadError')}</p></section>;
  const positions = await new PositionCatalogService(database).list();
  const nextOrder = Math.min(9999, Math.max(0, ...positions.map((position) => position.sortOrder)) + 10);
  return <section>
    <h2>{t('hrPositions')}</h2>
    <p>{t('hrPositionsNote')}</p>
    <div className="profile">
      <PositionForm position={{ name: '', category: 'GENERAL', allowedLevels: ['ปฏิบัติงาน', 'ชำนาญงาน', 'อาวุโส'], isActive: true, sortOrder: nextOrder }} />
      <PositionImportForm />
    </div>
    <table>
      <thead><tr><th>{t('hrPositionName')}</th><th>{t('hrPositionCategory')}</th><th>{t('hrPositionLevels')}</th><th>{t('hrPositionHolders')}</th><th>{t('hrPositionStatus')}</th><th>{t('hrEdit')}</th></tr></thead>
      <tbody>{positions.map((position) => <tr key={position.id}>
        <th scope="row">{position.name}</th>
        <td>{t(categoryLabelKeys[position.category])}</td>
        <td>{levelRange(position.allowedLevels)}</td>
        <td>{`${position.holders} ${t('hrPeopleUnit')}`}</td>
        <td>{position.isActive ? t('hrPositionActive') : t('hrPositionInactive')}</td>
        <td><details><summary>{t('hrEdit')}</summary><PositionForm position={position} /></details></td>
      </tr>)}</tbody>
    </table>
  </section>;
}
