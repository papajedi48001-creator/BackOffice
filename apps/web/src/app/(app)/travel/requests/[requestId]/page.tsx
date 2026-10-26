import { notFound, redirect } from 'next/navigation';
import { OfficialTravelQueries } from '@backoffice/core';
import { t } from '@backoffice/i18n';
import { getSharedDatabase } from '../../../../../lib/database';
import { travelSession } from '../../travel-page';

/** Where a notice about one person's travel คำขอ lands: the trip page, which checks who may see it. */
export default async function TravelRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const session = await travelSession();
  if (!session) return null;
  const database = getSharedDatabase();
  if (!database) return <section><p role="alert">{t('travelLoadError')}</p></section>;
  const travelId = await new OfficialTravelQueries(database).travelIdOfRequest((await params).requestId);
  if (!travelId) { notFound(); return null; }
  redirect(`/travel/${travelId}`);
  return null;
}
