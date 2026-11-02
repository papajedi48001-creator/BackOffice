import { chatResult, chatService, readMessage, withSessionAndDatabase } from '../../chat-route';

/** Sends a message to ผู้ดูแลระบบ. There is no recipient field: a person can write only to ผู้ดูแลระบบ. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const input = await readMessage(request);
    if (!input.ok) return input.response;
    return chatResult(await chatService(database).sendAsPerson(session, input.value), 201);
  });
}
