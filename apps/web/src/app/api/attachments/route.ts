import { NextResponse } from 'next/server';
import { requireAuthorized } from '../../../lib/require-authorized';

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthorized(request);
    return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? (error as { status: number }).status : 400;
    return NextResponse.json({ error: status === 401 ? 'unauthenticated' : 'attachment_not_accepted' }, { status });
  }
}
