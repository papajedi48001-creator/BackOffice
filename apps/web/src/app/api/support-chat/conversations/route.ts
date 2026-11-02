import { chatResult, chatService, withSessionAndDatabase } from '../chat-route';

/** ผู้ดูแลระบบ only (checked by the service): every conversation, newest first. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => chatResult(await chatService(database).adminInbox(session)));
}
