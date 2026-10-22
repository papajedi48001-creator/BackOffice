import { NextResponse } from 'next/server';
import { organizationErrorResponse, readJson, withOrganizationManager } from '../organization-route';

const bangkokOffsetMs = 7 * 60 * 60 * 1000;

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }): Promise<Response> {
  return withOrganizationManager(request, async (service, actorPersonId) => {
    const { organizationId } = await context.params;
    const body = await readJson(request) as { personId?: unknown; effectiveFrom?: unknown } | null;
    const personId = typeof body?.personId === 'string' && body.personId ? body.personId : null;
    const day = typeof body?.effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom) ? new Date(`${body.effectiveFrom}T00:00:00Z`) : null;
    if (!personId || !day || Number.isNaN(day.getTime())) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    // The form picks a Bangkok calendar day; the term starts at that day's midnight in Bangkok.
    const decision = await service.assign({ organizationId, personId, effectiveFrom: new Date(day.getTime() - bangkokOffsetMs) }, actorPersonId);
    return decision.kind === 'error' ? organizationErrorResponse(decision.code) : NextResponse.json({ ok: true });
  });
}
