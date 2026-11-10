import { labOpeningLineInputSchema } from '@backoffice/contracts';
import { labOpening, labResult, readInput, withSessionAndDatabase } from '../../../lab-route';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readInput(request, labOpeningLineInputSchema);
    if (!input.ok) return input.response;
    return labResult(await labOpening(database).saveLine(session, (await context.params).id, input.value));
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => labResult(await labOpening(database).deleteLine(session, (await context.params).id)));
}
