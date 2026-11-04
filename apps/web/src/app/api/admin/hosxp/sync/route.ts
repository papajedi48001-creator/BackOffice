import { NextResponse } from 'next/server';
import { holidaySync } from '../../../../../lib/hosxp';
import { withAdmin } from '../../admin-route';

const statusByCode: Record<string, number> = { NOT_CONFIGURED: 409, CONNECTION_FAILED: 502, COLUMNS_NOT_FOUND: 422 };

/** ดึงวันหยุดตอนนี้: the same sync the worker runs daily, started by ผู้ดูแลระบบ. */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const result = await holidaySync(database).sync(session.personId);
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: statusByCode[result.code] ?? 500 });
  });
}
