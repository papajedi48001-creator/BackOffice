import { notifyChatChanged } from '../../../../../../lib/chat-stream';
import { chatResult, chatService, withSessionAndDatabase } from '../../../chat-route';

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const result = await chatService(database).markReadByAdmin(session, (await context.params).conversationId);
    // Other ผู้ดูแลระบบ see the conversation leave their count.
    if (result.ok) notifyChatChanged();
    return chatResult(result);
  });
}
