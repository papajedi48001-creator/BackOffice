import { NextResponse } from 'next/server';
import { DeviceService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { modeOf, readModuleModes } from '../../../lib/module-gate';

const noStore = { 'cache-control': 'no-store' };
export const kioskError = (code: string, status: number) => NextResponse.json({ error: code }, { status, headers: noStore });
export const kioskJson = (body: unknown) => NextResponse.json(body, { headers: noStore });

/**
 * The box APIs live outside /attendance, so the module gate does not see them: a box has no person to check for โหมดพัฒนา
 * (the box itself was registered by a ผู้ดูแลระบบ), but an OFF module still refuses every box.
 */
export async function withKioskDatabase(action: (database: Database) => Promise<Response>): Promise<Response> {
  const database = getSharedDatabase();
  if (!database) return kioskError('service_unavailable', 503);
  if (modeOf(await readModuleModes(database), 'attendance') === 'OFF') return kioskError('MODULE_OFF', 503);
  return action(database);
}

/** A signed box request: the four headers, the exact body text, and the path as the box signed it. */
export function withDevice(request: Request, action: (device: { id: string; locationId: string }, database: Database, body: string) => Promise<Response>): Promise<Response> {
  return withKioskDatabase(async (database) => {
    const body = await request.text();
    const header = (name: string) => request.headers.get(name) ?? '';
    const result = await new DeviceService(database).authenticate({ deviceId: header('x-device-id'), timestamp: header('x-timestamp'), nonce: header('x-nonce'), signature: header('x-signature'), method: request.method, path: new URL(request.url).pathname, body });
    if (!result.ok) return kioskError(result.code, 401);
    return action(result.device, database, body);
  });
}

/** Per-instance limit on รหัสจับคู่ guesses: 10 a minute from one address. Enough with one web container; see the runbook. */
const PAIR_LIMIT = 10;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();
export function allowPairAttempt(request: Request, now = Date.now()): boolean {
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const entry = attempts.get(address);
  if (!entry || entry.resetAt <= now) { attempts.set(address, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  entry.count += 1;
  return entry.count <= PAIR_LIMIT;
}
export function resetPairLimiter(): void { attempts.clear(); }
