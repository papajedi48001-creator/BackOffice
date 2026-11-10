import { saveSetting } from '../../settings-kinds';

export async function PUT(request: Request, context: { params: Promise<{ kind: string; id: string }> }): Promise<Response> {
  const { kind, id } = await context.params;
  return saveSetting(request, kind, id);
}
