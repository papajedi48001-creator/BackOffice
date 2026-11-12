import { notifyChatChanged } from '../../../../../../lib/chat-stream';
import { chatResult, chatService, readMessage, withSessionAndDatabase } from '../../../chat-route';

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readMessage(request);
    if (!input.ok) return input.response;
    const result = await chatService(database).sendAsAdmin(session, (await context.params).conversationId, input.value);
    if (result.ok) notifyChatChanged();
    return chatResult(result, 201);
  });
}
