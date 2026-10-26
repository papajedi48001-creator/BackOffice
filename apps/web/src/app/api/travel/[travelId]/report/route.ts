import { travelReportInputSchema } from '@backoffice/contracts';
import { TravelReportService } from '@backoffice/core';
import { readInput, travelResult, withoutLeader, withSessionAndDatabase } from '../../travel-route';

/** The หัวหน้าคณะ files or edits รายงานการไปราชการ; the service checks who they are and that the trip has ended. */
export async function PUT(request: Request, context: { params: Promise<{ travelId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, travelReportInputSchema, withoutLeader);
    if (!input.ok) return input.response;
    const { travelId } = await context.params;
    return travelResult(await new TravelReportService(database).save(session.personId, travelId, input.value));
  });
}
