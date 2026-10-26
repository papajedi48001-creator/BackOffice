import { canManageLeave, exportLeaveBalancesCsv } from '@backoffice/core';
import { csvDownload, exportForm, exportReason, fiscalYearOf, forbidden, invalidInput, withSessionAndDatabase } from '../../leave-route';

/** ยอดยกมา template with what is stored, for HR to edit and import again. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const form = await exportForm(request);
    if (!form) return invalidInput(['form']);
    const fiscalYear = fiscalYearOf(form.get('fiscalYear'));
    const reason = exportReason(form);
    if (!fiscalYear || !reason) return invalidInput([...(fiscalYear ? [] : ['fiscalYear']), ...(reason ? [] : ['reason'])]);
    return csvDownload(database, { actorPersonId: session.personId, reason, scope: { fiscalYear, dataset: 'balances' } }, `leave-balances-${fiscalYear}.csv`, () => exportLeaveBalancesCsv(database, fiscalYear));
  });
}
