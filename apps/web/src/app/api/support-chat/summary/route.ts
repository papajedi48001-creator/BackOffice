import { NextResponse } from 'next/server';
import { chatService, withSessionAndDatabase } from '../chat-route';

/** The chat button's count: replies not yet read, or for ผู้ดูแลระบบ the conversations waiting. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => NextResponse.json({ unread: await chatService(database).unreadCount(session) }));
}
