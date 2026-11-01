import { NextResponse } from 'next/server';
import { canManagePeople, type NationalIdProtector } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { getNationalIdProtector } from '../../../lib/national-id';
import { readSession } from '../../../lib/session';

type Session = NonNullable<Awaited<ReturnType<typeof readSession>>> & { personId: string };

/** Hands a signed-in session and the database to the action; access itself is checked by the service or the action. */
export async function withSessionAndDatabase(request: Request, action: (session: Session, database: Database) => Promise<Response>): Promise<Response> {
  const session = await readSession(request);
  if (!session?.authenticated || !session.personId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  return action(session as Session, database);
}

/** Parses the JSON body with a schema. A failure names the fields only, never their values. */
type Issue = { readonly path: readonly PropertyKey[]; readonly code: string; readonly keys?: readonly string[] };
type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: readonly Issue[] } } };

export async function readInput<T>(request: Request, schema: Schema<T>, prepare: (body: Record<string, unknown>) => Record<string, unknown> = (body) => body): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const parsed = body && typeof body === 'object' && !Array.isArray(body) ? schema.safeParse(prepare(body as Record<string, unknown>)) : null;
  if (parsed?.success) return { ok: true, value: parsed.data };
  const fields = parsed ? [...new Set(parsed.error.issues.flatMap((issue) => issue.path.length > 0 ? [String(issue.path[0])] : issue.code === 'unrecognized_keys' ? issue.keys ?? [] : []))] : [];
  return { ok: false, response: NextResponse.json({ error: 'invalid_input', fields }, { status: 400 }) };
}

const statusByCode: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, DUPLICATE_CODE: 409, DUPLICATE_NAME: 409, POSITION_IN_USE: 409, DUPLICATE_NATIONAL_ID: 409, DUPLICATE_EMPLOYEE_CODE: 409, DUPLICATE_USERNAME: 409, ACCOUNT_EXISTS: 409, NO_ACCOUNT: 409, PROTECTED_ACCOUNT: 409 };

export function resultResponse(result: { ok: true; id?: string } | { ok: false; code: string }, createdStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: createdStatus });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}

export function forbidden(): Response {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

/** For a hospital-wide HR manager's people actions, which read or write a national ID and so need its key. Anyone else is refused before the body is read. */
export async function withNationalIdKey(request: Request, action: (session: Session, database: Database, protector: NationalIdProtector) => Promise<Response>): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManagePeople(session)) return forbidden();
    const protector = getNationalIdProtector();
    if (!protector) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
    return action(session, database, protector);
  });
}
