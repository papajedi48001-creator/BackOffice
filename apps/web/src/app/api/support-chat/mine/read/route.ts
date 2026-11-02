import { NextResponse } from 'next/server';
import { chatService, withSessionAndDatabase } from '../../chat-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    await chatService(database).markReadByPerson(session);
    return NextResponse.json({ ok: true });
  });
}
