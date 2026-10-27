import { NextResponse } from 'next/server';
import { updateOrganizationUnitInputSchema } from '@backoffice/contracts';
import { organizationErrorResponse, readJson, withStructureManager } from './organization-route';

/** Renames a unit, or moves a งาน to another กลุ่มงาน. */
export async function PUT(request: Request, context: { params: Promise<{ organizationId: string }> }): Promise<Response> {
  return withStructureManager(request, async (service, actorPersonId) => {
    const { organizationId } = await context.params;
    const input = updateOrganizationUnitInputSchema.safeParse(await readJson(request));
    if (!input.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    const result = await service.update(organizationId, input.data, actorPersonId);
    return result.ok ? NextResponse.json(result) : organizationErrorResponse(result.code);
  });
}

/** Deletes a unit and everything under it; their people are left with no unit. */
export async function DELETE(request: Request, context: { params: Promise<{ organizationId: string }> }): Promise<Response> {
  return withStructureManager(request, async (service, actorPersonId) => {
    const { organizationId } = await context.params;
    const result = await service.delete(organizationId, actorPersonId);
    return result.ok ? NextResponse.json(result) : organizationErrorResponse(result.code);
  });
}
