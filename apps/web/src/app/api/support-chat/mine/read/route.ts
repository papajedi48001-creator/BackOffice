import { NextResponse } from 'next/server';
import { notifyChatChanged } from '../../../../../lib/chat-stream';
import { chatService, withSessionAndDatabase } from '../../chat-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    await chatService(database).markReadByPerson(session);
    notifyChatChanged();
    return NextResponse.json({ ok: true });
  });
}
