import { NextResponse } from 'next/server';
import { LineService } from '@backoffice/core';
import { addFriendUrl, lineSettings } from '../../../../lib/line-api';
import { withSessionAndDatabase } from '../../hr/profile-route';

/** สร้างรหัสเชื่อมต่อ LINE for the signed-in person. The code goes only into this response, never a URL or a log. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const settings = lineSettings();
    if (!settings.accessToken || !settings.channelSecret) return NextResponse.json({ error: 'line_not_configured' }, { status: 503 });
    const created = await new LineService(database).createLinkCode(session.personId);
    return NextResponse.json({ ...created, addFriendUrl: addFriendUrl(settings.basicId) }, { headers: { 'Cache-Control': 'no-store' } });
  });
}
