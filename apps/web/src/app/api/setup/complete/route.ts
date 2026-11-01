import { NextResponse } from 'next/server';
import { setupCompleteSchema } from '@backoffice/contracts';
import { clearSetupCode, verifySetupCode } from '../../../../lib/setup-code';
import { writeDatabaseConfig } from '../../../../lib/setup-config';
import { isSetupMode } from '../../../../lib/setup-mode';
import { createFirstRunSetup, readSetupBody, setupFailure, setupNotFound, setupRefused } from '../../../../lib/setup-service';

// One completion at a time per process, so two clicks cannot create two administrators.
const lockKey = Symbol.for('backoffice.setupRunning');
const store = globalThis as unknown as Record<symbol, boolean | undefined>;

export async function POST(request: Request): Promise<Response> {
  if (!isSetupMode()) return setupNotFound();
  if (store[lockKey]) return setupRefused('already_configured', 409);
  store[lockKey] = true;
  try {
    const body = await readSetupBody(request, setupCompleteSchema);
    if (!body) return setupRefused('invalid_input', 400);
    if (!verifySetupCode(body.code)) return setupRefused('invalid_code', 403);
    const completed = await createFirstRunSetup().complete(body.database, body.admin);
    await writeDatabaseConfig(completed.databaseUrl);
    clearSetupCode();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return setupFailure(error);
  } finally {
    store[lockKey] = false;
  }
}
