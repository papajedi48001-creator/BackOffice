import { mciRulesInputSchema } from '@backoffice/contracts';
import { canCommandMci, forbidden, mciResult, mciSettings, readInput, withSessionAndDatabase } from '../../mci-route';

/** Replaces every กฎจัดคน. */
export async function PUT(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canCommandMci(session)) return forbidden();
    const input = await readInput(request, mciRulesInputSchema);
    if (!input.ok) return input.response;
    return mciResult(await mciSettings(database).saveRules(session.personId, input.value));
  });
}
