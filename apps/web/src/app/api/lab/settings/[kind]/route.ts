import { saveSetting } from '../settings-kinds';

export async function POST(request: Request, context: { params: Promise<{ kind: string }> }): Promise<Response> {
  return saveSetting(request, (await context.params).kind, null);
}
