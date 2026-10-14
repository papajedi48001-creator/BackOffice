import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository } from '@backoffice/core';
import { getSharedDatabase } from '../../../../../lib/database';
import { endSession, sessionCookieName, sessionCookieOptions } from '../../../../../lib/session';

export async function POST(request: Request): Promise<Response> {
  const personId = await endSession(request);
  const database = personId ? getSharedDatabase() : null;
  if (personId && database) {
    await new AuditService(new DatabaseAuditRepository(database)).recordAudit({ actorPersonId: personId, action: 'identity.local_logout', targetType: 'person', targetId: personId, result: 'SUCCESS', metadata: {} });
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(sessionCookieName, '', sessionCookieOptions(0));
  return response;
}
