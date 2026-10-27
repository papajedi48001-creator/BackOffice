import { t } from '@backoffice/i18n';
import { attachmentsEnabled } from '../../../../lib/attachments';
import { getSharedDatabase } from '../../../../lib/database';
import { travelSession } from '../travel-page';
import { TravelForm } from './travel-form';
import { leaderOf } from '../travel-leader';

export default async function NewTravelPage() {
  const session = await travelSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><h2>{t('travelNew')}</h2><p role="alert">{t('travelLoadError')}</p></section>;
  return <section>
    <h2>{t('travelNew')}</h2>
    <TravelForm leader={await leaderOf(database, session.personId)} attachments={attachmentsEnabled()} />
  </section>;
}
