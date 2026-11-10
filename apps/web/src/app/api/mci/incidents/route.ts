import { mciOpenIncidentInputSchema } from '@backoffice/contracts';
import { canCommandMci, forbidden, mciIncidents, mciResult, readInput, withSessionAndDatabase } from '../mci-route';

/** เปิดเหตุ: ผู้บัญชาการเหตุ (mci.command) only. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canCommandMci(session)) return forbidden();
    const input = await readInput(request, mciOpenIncidentInputSchema);
    if (!input.ok) return input.response;
    return mciResult(await mciIncidents(database).open(session.personId, input.value), 201);
  });
}
