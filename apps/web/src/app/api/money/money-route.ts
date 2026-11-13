import { NextResponse } from 'next/server';
import { MoneyMemberService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export { forbidden, readInput, withSessionAndDatabase };

export const moneyMembers = (database: Database) => new MoneyMemberService(database);

const statusByCode: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404 };

/** A service result as JSON: `{ error: code }` with 403/404 where the code says so, otherwise 400. */
export function moneyResult(result: { ok: true } | { ok: false; code: string }): Response {
  if (result.ok) return NextResponse.json(result);
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}
