import { NextResponse } from 'next/server';
import { supportMessageInputSchema } from '@backoffice/contracts';
import { SupportChatService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { readInput, withSessionAndDatabase } from '../hr/profile-route';

export { withSessionAndDatabase };

export const chatService = (database: Database) => new SupportChatService(database);
export const readMessage = (request: Request) => readInput(request, supportMessageInputSchema);

const statusByCode: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, EMPTY_MESSAGE: 400, INVALID_ATTACHMENT: 400 };

/** A service result as a response; refusals carry only their code. */
export function chatResult(result: { ok: true } | { ok: false; code: string }, okStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: okStatus });
  return NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 400 });
}
