import { notFound, redirect } from 'next/navigation';
import { AuthorizationService, RoomBookingQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { pageActor } from '../../../../lib/actor';
import { getSharedDatabase } from '../../../../lib/database';
import { RoomManageForms } from './room-manage-forms';

export default async function RoomManagePage() {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const scope = new AuthorizationService().organizationScope({ authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] }, 'room.manage');
  if (scope !== 'all' && scope.length === 0) notFound();
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('roomManageTitle')}</h2><p role="alert">{t('roomActionFailed')}</p></section>;
  const queries = new RoomBookingQueries(database);
  const [rooms, addons, organizations] = await Promise.all([
    queries.listRooms({ bookableOnly: false }), queries.listAddons({ activeOnly: false }),
    database.query<{ id: string; name: string }>('SELECT id, name FROM organization WHERE deleted_at IS NULL ORDER BY name')
  ]);
  const inScope = (organizationId: string) => scope === 'all' || scope.includes(organizationId);
  return <section><h2>{t('roomManageTitle')}</h2><RoomManageForms rooms={rooms.filter((room) => inScope(room.ownerOrganizationId))} addons={addons} organizations={organizations.filter((organization) => inScope(organization.id))} /></section>;
}
