import { NextResponse } from 'next/server';
import { chatService, withSessionAndDatabase } from '../chat-route';

/** The signed-in person's own conversation with ผู้ดูแลระบบ. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => NextResponse.json({ messages: await chatService(database).myMessages(session) }));
}
