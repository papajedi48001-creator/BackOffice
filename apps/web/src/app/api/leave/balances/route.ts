import { NextResponse } from 'next/server';
import { LeaveBalanceImportService, canManageLeave, exportLeaveBalancesCsv } from '@backoffice/core';
import { csvDownload, exportReason, forbidden, invalidInput, withSessionAndDatabase } from '../leave-route';

const maxFileBytes = 2 * 1024 * 1024;
const fiscalYearOf = (value: unknown) => { const year = Number(value); return Number.isInteger(year) && year >= 2500 && year <= 2700 ? year : null; };

/** ยอดยกมา template with what is stored, for HR to edit and import again. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const url = new URL(request.url);
    const fiscalYear = fiscalYearOf(url.searchParams.get('fiscalYear'));
    const reason = exportReason(url);
    if (!fiscalYear || !reason) return invalidInput([...(fiscalYear ? [] : ['fiscalYear']), ...(reason ? [] : ['reason'])]);
    return csvDownload(database, { actorPersonId: session.personId, reason, scope: { fiscalYear, dataset: 'balances' } }, `leave-balances-${fiscalYear}.csv`, () => exportLeaveBalancesCsv(database, fiscalYear));
  });
}

export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    let form: FormData;
    try { form = await request.formData(); } catch { return NextResponse.json({ error: 'invalid_upload' }, { status: 400 }); }
    const fiscalYear = fiscalYearOf(form.get('fiscalYear'));
    const file = form.get('file');
    if (!fiscalYear || !(file instanceof File) || file.size === 0) return invalidInput([...(fiscalYear ? [] : ['fiscalYear']), ...(file instanceof File && file.size > 0 ? [] : ['file'])]);
    if (file.size > maxFileBytes) return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
    try {
      const result = await new LeaveBalanceImportService(database).apply(await file.text(), fiscalYear, session.personId);
      return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: 422 });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CSV') return NextResponse.json({ error: 'invalid_csv' }, { status: 400 });
      throw error;
    }
  });
}
