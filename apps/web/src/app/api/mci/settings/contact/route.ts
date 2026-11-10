import { mciContactInputSchema } from '@backoffice/contracts';
import { canCommandMci, forbidden, mciResult, mciSettings, readInput, withSessionAndDatabase } from '../../mci-route';

/** The จุดประชาสัมพันธ์ phone shown on the กระดานสาธารณะ. */
export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canCommandMci(session)) return forbidden();
    const input = await readInput(request, mciContactInputSchema);
    if (!input.ok) return input.response;
    return mciResult(await mciSettings(database).saveContact(session.personId, input.value));
  });
}
