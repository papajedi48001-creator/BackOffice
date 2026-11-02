import { NextResponse } from 'next/server';
import { setupTestConnectionSchema } from '@backoffice/contracts';
import { verifySetupCode } from '../../../../lib/setup-code';
import { isSetupMode } from '../../../../lib/setup-mode';
import { createFirstRunSetup, readSetupBody, setupFailure, setupNotFound, setupRefused } from '../../../../lib/setup-service';

export async function POST(request: Request): Promise<Response> {
  if (!isSetupMode()) return setupNotFound();
  const body = await readSetupBody(request, setupTestConnectionSchema);
  if (!body) return setupRefused('invalid_input', 400);
  if (!verifySetupCode(body.code)) return setupRefused('invalid_code', 403);
  try {
    return NextResponse.json({ ok: true, ...(await createFirstRunSetup().testConnection(body.database)) });
  } catch (error) {
    return setupFailure(error);
  }
}
