import { chatEventStream } from '../../../../lib/chat-stream';
import { chatService, withSessionAndDatabase } from '../chat-route';

export const dynamic = 'force-dynamic';

/** Live แชตกับผู้ดูแลระบบ: Server-Sent Events carrying the signed-in person's chat state (count and newest time, never text). */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const service = chatService(database);
    return new Response(chatEventStream(() => service.liveState(session), undefined, request.signal), {
      status: 200,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' }
    });
  });
}
