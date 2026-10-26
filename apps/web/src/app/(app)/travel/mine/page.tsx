import Link from 'next/link';
import { OfficialTravelQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../lib/database';
import { TravelTable } from '../travel-list';
import { travelSession } from '../travel-page';

export default async function MyTravelPage() {
  const session = await travelSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('travelMine')}</h2><p role="alert">{t('travelLoadError')}</p></section>;
  const items = await new OfficialTravelQueries(database).mine(session.personId);
  return <section>
    <div className="page-heading"><h2>{t('travelMine')}</h2><div className="page-actions"><Link className="button-link" href="/travel/new">{t('travelNew')}</Link></div></div>
    {items.length === 0 ? <p>{t('travelNoTrips')}</p> : <TravelTable items={items} />}
  </section>;
}
