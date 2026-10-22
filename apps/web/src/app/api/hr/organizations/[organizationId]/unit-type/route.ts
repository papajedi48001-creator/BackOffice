import { NextResponse } from 'next/server';
import { organizationUnitTypeSchema } from '@backoffice/contracts';
import { organizationErrorResponse, readJson, withOrganizationManager } from '../organization-route';

export async function PUT(request: Request, context: { params: Promise<{ organizationId: string }> }): Promise<Response> {
  return withOrganizationManager(request, async (service, actorPersonId) => {
    const { organizationId } = await context.params;
    const body = await readJson(request) as { unitType?: unknown } | null;
    const unitType = body?.unitType === null ? null : organizationUnitTypeSchema.safeParse(body?.unitType).data;
    if (unitType === undefined) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    const result = await service.setUnitType({ organizationId, unitType }, actorPersonId);
    return result.ok ? NextResponse.json({ ok: true }) : organizationErrorResponse(result.code);
  });
}
