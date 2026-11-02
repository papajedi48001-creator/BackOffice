import { NextResponse } from 'next/server';
import { FirstRunSetup, SetupError } from '@backoffice/core';
import { createDatabase } from '@backoffice/db';
import { getNationalIdProtector } from './national-id';
import { migrationsDir } from './setup-config';

/** One short-lived connection per setup request; it never becomes the shared pool. */
export function createFirstRunSetup(): FirstRunSetup {
  return new FirstRunSetup({ connect: (url) => createDatabase(`${url}?connectionLimit=1&connectTimeout=10000`), protector: getNationalIdProtector(), migrationsDir: migrationsDir() });
}

export const setupNotFound = () => NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
export const setupRefused = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status });

/** A SetupError code as the page shows it. Anything else may carry the host or user in its message, so only its code is logged. */
export function setupFailure(error: unknown): Response {
  if (error instanceof SetupError) return setupRefused(error.code, error.code === 'invalid_code' ? 403 : error.code === 'config_write_failed' ? 500 : 400);
  console.error('backoffice.setup.failed', { code: (error as { code?: string }).code ?? 'UNKNOWN' });
  return setupRefused('connection_failed', 500);
}

/** Reads and validates a JSON body; null when it is not one the schema accepts. */
export async function readSetupBody<T>(request: Request, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }): Promise<T | null> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}
