import { labOpening, labResult, withSessionAndDatabase } from '../../lab-route';

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => labResult(await labOpening(database).submit(session)));
}
