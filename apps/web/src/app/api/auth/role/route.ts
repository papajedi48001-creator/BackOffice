import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';
import { readSessionToken, sessionService } from '../../../../lib/session';

function readRole(body: unknown): string | null {
  const role = (body as { role?: unknown } | null)?.role;
  return typeof role === 'string' && role.trim().length > 0 && role.length <= 64 ? role.trim() : null;
}

/** Saves the role this session works in (เลือกบทบาท / เปลี่ยนบทบาท). The server refuses a role the person does not hold. */
export async function POST(request: Request): Promise<Response> {
  const token = readSessionToken(request);
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const role = readRole(await request.json().catch(() => null));
  if (!role) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  try {
    const chosen = await database.transaction(async (tx) => {
      const result = await sessionService(tx).chooseRole(token, role);
      if (result) await new AuditService(new DatabaseAuditRepository(tx)).recordAudit({ actorPersonId: result.personId, action: 'session.role.selected', targetType: 'person', targetId: result.personId, result: 'SUCCESS', metadata: { roleName: result.role, previousRoleName: result.previousRole } });
      return result;
    });
    if (!chosen) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    return NextResponse.json({ activeRole: chosen.role });
  } catch (error) {
    if (error instanceof Error && error.message === 'ROLE_NOT_HELD') return NextResponse.json({ error: 'role_not_held' }, { status: 403 });
    console.error('choose_role_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
