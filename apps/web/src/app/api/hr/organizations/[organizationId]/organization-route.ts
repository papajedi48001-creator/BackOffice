import { NextResponse } from 'next/server';
import { AuthorizationService, OrganizationHeadService, OrganizationStructureService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../../../lib/database';
import { readSession } from '../../../../../lib/session';

/** Checks that the caller may manage organizations hospital-wide, then hands the service and actor to the action. */
export async function withOrganizationManager(request: Request, action: (service: OrganizationHeadService, actorPersonId: string) => Promise<Response>): Promise<Response> {
  return withManagerDatabase(request, (database, actorPersonId) => action(new OrganizationHeadService(database), actorPersonId));
}

/** The same check for adding, renaming, moving and deleting กลุ่มงาน and งาน. */
export async function withStructureManager(request: Request, action: (service: OrganizationStructureService, actorPersonId: string) => Promise<Response>): Promise<Response> {
  return withManagerDatabase(request, (database, actorPersonId) => action(new OrganizationStructureService(database), actorPersonId));
}

async function withManagerDatabase(request: Request, action: (database: Database, actorPersonId: string) => Promise<Response>): Promise<Response> {
  const session = await readSession(request);
  if (!session?.authenticated || !session.personId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!new AuthorizationService().canActHospitalWide(session, 'hr.organization.manage', 'hr')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  return action(database, session.personId);
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

export function organizationErrorResponse(code: string): Response {
  return NextResponse.json({ error: code }, { status: code === 'ORGANIZATION_NOT_FOUND' ? 404 : code === 'DUPLICATE_NAME' ? 409 : 400 });
}
