import { OfficialTravelQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { FleetPageMessage, fleetSession, travelPrefill } from '../fleet-page';
import { FleetForm } from './fleet-form';

/** ขอใช้รถ; with `?travel=<travelId>` the form starts from a คำขอไปราชการ the person may see. Whether they may file from it is the server's check on submit. */
export default async function NewFleetRequestPage({ searchParams }: { searchParams: Promise<{ travel?: string | string[] }> }) {
  const session = await fleetSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <FleetPageMessage titleKey="fleetNew" reason="unavailable" />;
  const travelParam = (await searchParams).travel;
  const travelId = Array.isArray(travelParam) ? travelParam[0] : travelParam;
  const travel = travelId ? await new OfficialTravelQueries(database).detail(travelId, session) : null;
  return <section>
    <h2>{travel ? t('fleetFromTravel') : t('fleetNew')}</h2>
    {travel && <p className="permission-notice">{t('fleetFromTravelHelp')}</p>}
    <FleetForm initial={travel ? travelPrefill(travel) : undefined} officialTravelId={travel?.travelId} />
  </section>;
}
