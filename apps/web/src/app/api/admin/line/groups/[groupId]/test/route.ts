import { NextResponse } from 'next/server';
import { lineGroupIdSchema } from '@backoffice/contracts';
import { lineSettings, pushLineText } from '../../../../../../../lib/line-api';
import { withAdmin } from '../../../../admin-route';

/** ส่งข้อความทดสอบ into a group, so ผู้ดูแลระบบ can see the bot can post there. Uses quota like any push. */
export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }): Promise<Response> {
  return withAdmin(request, async () => {
    const groupId = lineGroupIdSchema.safeParse((await params).groupId);
    if (!groupId.success) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const { accessToken } = lineSettings();
    if (!accessToken) return NextResponse.json({ error: 'LINE_NOT_CONFIGURED' }, { status: 503 });
    const sent = await pushLineText(accessToken, groupId.data, 'ทดสอบการแจ้งเตือนจาก Back Office');
    return sent ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'LINE_REFUSED' }, { status: 502 });
  });
}
