import { NextResponse } from 'next/server';
import { lineGroupIdSchema, lineUserIdSchema } from '@backoffice/contracts';
import { LineService, normalizeLinkCode, verifyLineSignature } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';
import { lineGroupName, lineSettings, replyLineText } from '../../../../lib/line-api';

interface LineEvent { type?: unknown; replyToken?: unknown; source?: { type?: unknown; groupId?: unknown; userId?: unknown }; message?: { type?: unknown; text?: unknown } }

export const dynamic = 'force-dynamic';

const LINKED = 'เชื่อมต่อบัญชี LINE กับ Back Office แล้ว';
const REFUSED = 'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่ในระบบ';

/**
 * LINE Messaging API webhook: the one route that needs no session, so every body must carry LINE's signature.
 * Handles join/leave of a group, unfollow, and a รหัสเชื่อมต่อ LINE sent in the private chat with the bot. Bodies and chat text are never logged.
 */
export async function POST(request: Request): Promise<Response> {
  const settings = lineSettings();
  const database = getSharedDatabase();
  if (!settings.channelSecret || !database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const raw = await request.text();
  if (!verifyLineSignature(settings.channelSecret, raw, request.headers.get('x-line-signature'))) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  let events: LineEvent[] = [];
  try { events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? []; } catch { return NextResponse.json({ error: 'invalid_input' }, { status: 400 }); }
  const service = new LineService(database);
  for (const event of Array.isArray(events) ? events : []) {
    const groupId = lineGroupIdSchema.safeParse(event.source?.groupId);
    if (event.type === 'join' && groupId.success) {
      await service.groupJoined(groupId.data, settings.accessToken ? await lineGroupName(settings.accessToken, groupId.data) : null);
    } else if (event.type === 'leave' && groupId.success) {
      await service.groupLeft(groupId.data);
    } else if (event.type === 'unfollow' && event.source?.type === 'user') {
      // The person blocked the bot: stop @mentioning them until they link again.
      const userId = lineUserIdSchema.safeParse(event.source.userId);
      if (userId.success) await service.unlinkLineUser(userId.data);
    } else if (event.type === 'message' && event.source?.type === 'user' && event.message?.type === 'text' && typeof event.message.text === 'string') {
      // Codes count only in the private chat with the bot, so group chat is never read as a code or answered.
      const code = normalizeLinkCode(event.message.text);
      const userId = lineUserIdSchema.safeParse(event.source?.userId);
      if (!code || !userId.success) continue;
      const result = await service.linkByCode(code, userId.data);
      if (settings.accessToken && typeof event.replyToken === 'string') await replyLineText(settings.accessToken, event.replyToken, result.ok ? LINKED : REFUSED);
    }
  }
  return NextResponse.json({ ok: true });
}
