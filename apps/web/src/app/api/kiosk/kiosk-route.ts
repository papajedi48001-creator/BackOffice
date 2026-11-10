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
    if (!result.ok) return result.code === 'CLOCK_SKEW' ? NextResponse.json({ error: result.code, serverTime: result.serverTime }, { status: 401, headers: noStore }) : kioskError(result.code, 401);
    return action(result.device, database, body);
  });
}

/**
 * Per-instance limits on รหัสจับคู่ guesses: 10 a minute from one address, and 30 wrong codes a minute from all addresses
 * together, so a caller who rotates addresses still cannot search the 8-digit space. Enough with one web container.
 * The address is the last x-forwarded-for hop, the one our own proxy appended, never the caller's own first entry.
 */
const PAIR_LIMIT = 10;
const GLOBAL_FAILED_LIMIT = 30;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();
let failed = { count: 0, resetAt: 0 };
export function allowPairAttempt(request: Request, now = Date.now()): boolean {
  if (failed.resetAt > now && failed.count >= GLOBAL_FAILED_LIMIT) return false;
  for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
  const address = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const entry = attempts.get(address);
  if (!entry) { attempts.set(address, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  entry.count += 1;
  return entry.count <= PAIR_LIMIT;
}
/** Counts one wrong รหัสจับคู่ toward the limit shared by every address. */
export function recordPairFailure(now = Date.now()): void {
  if (failed.resetAt <= now) failed = { count: 0, resetAt: now + WINDOW_MS };
  failed.count += 1;
}
export function resetPairLimiter(): void { attempts.clear(); failed = { count: 0, resetAt: 0 }; }
