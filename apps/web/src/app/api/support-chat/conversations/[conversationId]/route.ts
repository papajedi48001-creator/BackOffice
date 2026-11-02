import { chatResult, chatService, withSessionAndDatabase } from '../../chat-route';

export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => chatResult(await chatService(database).adminMessages(session, (await context.params).conversationId)));
}
