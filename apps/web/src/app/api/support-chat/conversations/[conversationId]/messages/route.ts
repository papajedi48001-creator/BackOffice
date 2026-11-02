import { chatResult, chatService, readMessage, withSessionAndDatabase } from '../../../chat-route';

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readMessage(request);
    if (!input.ok) return input.response;
    return chatResult(await chatService(database).sendAsAdmin(session, (await context.params).conversationId, input.value), 201);
  });
}
