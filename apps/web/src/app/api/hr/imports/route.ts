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

  if (Number(request.headers.get('content-length') ?? 0) > maxRequestBytes) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'invalid_upload' }, { status: 400 }); }
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
