import { NextResponse } from 'next/server';
import { testHosxpConnection } from '@backoffice/core';
import { hosxpSettings } from '../../../../../lib/hosxp';
import { withAdmin } from '../../admin-route';

/** ทดสอบการเชื่อมต่อ: counts HOSxP `holiday` rows without reading them. Failures come back as a code only. */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, async (_session, database) => {
    const connection = await hosxpSettings(database).resolve();
    if (!connection) return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 409 });
    const result = await testHosxpConnection(connection);
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: 502 });
  });
}
