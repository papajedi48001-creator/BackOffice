import { NextResponse } from 'next/server';
import { labOpening, labResult, withSessionAndDatabase } from '../../lab-route';

const MAX_BYTES = 2_000_000;

/** The CSV file as the raw body: `?kind=items` imports the ทะเบียนวัสดุ, `?kind=opening` replaces the draft ยอดยกมา. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const kind = new URL(request.url).searchParams.get('kind');
    if (kind !== 'items' && kind !== 'opening') return NextResponse.json({ error: 'invalid_input', fields: ['kind'] }, { status: 400 });
    const csv = await request.text();
    if (csv.length > MAX_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    const service = labOpening(database);
    return labResult(kind === 'items' ? await service.importItems(session, csv) : await service.importOpening(session, csv));
  });
}
