import { attendancePairInputSchema } from '@backoffice/contracts';
import { DeviceService } from '@backoffice/core';
import { allowPairAttempt, kioskError, kioskJson, withKioskDatabase } from '../kiosk-route';

/** จับคู่กล่อง: the box sends the รหัสจับคู่ and its public key. Any bad code gets the same answer. */
export function POST(request: Request): Promise<Response> {
  return withKioskDatabase(async (database) => {
    if (!allowPairAttempt(request)) return kioskError('RATE_LIMITED', 429);
    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }
    const parsed = attendancePairInputSchema.safeParse(body);
    if (!parsed.success) return kioskError('PAIRING_CODE_INVALID', 400);
    const result = await new DeviceService(database).pair(parsed.data);
    return result.ok ? kioskJson(result) : kioskError(result.code, 400);
  });
}

export const dynamic = 'force-dynamic';
