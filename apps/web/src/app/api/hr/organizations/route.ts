import { NextResponse } from 'next/server';
import { createOrganizationUnitInputSchema } from '@backoffice/contracts';
import { organizationErrorResponse, readJson, withStructureManager } from './[organizationId]/organization-route';

/** Adds a กลุ่มงาน, or a งาน under a กลุ่มงาน. */
export async function POST(request: Request): Promise<Response> {
  return withStructureManager(request, async (service, actorPersonId) => {
    const input = createOrganizationUnitInputSchema.safeParse(await readJson(request));
    if (!input.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    const result = await service.create(input.data, actorPersonId);
    return result.ok ? NextResponse.json(result, { status: 201 }) : organizationErrorResponse(result.code);
  });
}
