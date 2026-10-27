import { notFound, redirect } from 'next/navigation';
import { fleetContext, FleetPageMessage } from '../../../fleet-page';

/** Where a notice about a fleet คำขอ lands: the ใบ page, which checks who may see it. */
export default async function FleetByRequestPage({ params }: { params: Promise<{ requestId: string }> }) {
  const context = await fleetContext();
  if (!context.ok) return <FleetPageMessage titleKey="fleetRequest" reason={context.reason} />;
  const id = await context.queries.idOfHeadRequest((await params).requestId);
  if (!id) { notFound(); return null; }
  redirect(`/fleet/requests/${id}`);
  return null;
}
