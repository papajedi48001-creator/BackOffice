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

/** The body as text, or null once it passes `limit` bytes; stops reading there, so a chunked body without a length cannot grow without bound. */
export async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  return Buffer.concat(parts).toString('utf8');
}
