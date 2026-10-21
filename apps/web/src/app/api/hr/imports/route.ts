import { NextResponse } from 'next/server';
import { AuthorizationService, MasterDataImportService, type MasterDataFiles } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';
import { getNationalIdProtector } from '../../../../lib/national-id';
import { readSession } from '../../../../lib/session';

const maxFileBytes = 2 * 1024 * 1024;
const maxRequestBytes = 2 * maxFileBytes + 64 * 1024;
const fileFields = ['organizations', 'people'] as const;

export async function POST(request: Request): Promise<Response> {
  const session = await readSession(request);
  if (!session?.authenticated || !session.personId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!new AuthorizationService().canActHospitalWide(session, 'hr.person.manage', 'hr')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const database = getSharedDatabase();
  const protector = getNationalIdProtector();
  if (!database || !protector) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });

  const body = await readLimited(request, maxRequestBytes);
  if (body === 'too_large') return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  let form: FormData;
  try { form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData(); } catch { return NextResponse.json({ error: 'invalid_upload' }, { status: 400 }); }
  const mode = form.get('mode');
  if (mode !== 'validate' && mode !== 'apply') return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  const files: MasterDataFiles = {};
  for (const field of fileFields) {
    const file = form.get(field);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > maxFileBytes) return NextResponse.json({ error: 'file_too_large', file: field }, { status: 413 });
    files[field] = await file.text();
  }
  if (!files.organizations && !files.people) return NextResponse.json({ error: 'no_files' }, { status: 400 });

  try {
    const service = new MasterDataImportService(database, protector);
    const result = mode === 'apply' ? await service.apply(files, session.personId) : await service.validate(files);
    return result.ok ? NextResponse.json({ mode, summary: result.summary }) : NextResponse.json({ mode, errors: result.errors }, { status: 422 });
  } catch (error) {
    // The upload holds national IDs, so only the error code is logged.
    console.error('hr master data import failed', error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN');
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

/** Reads at most `limit` bytes so a chunked upload without Content-Length cannot exhaust memory. */
async function readLimited(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | 'too_large'> {
  if (Number(request.headers.get('content-length') ?? 0) > limit) return 'too_large';
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return 'too_large';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
