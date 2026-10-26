import { LeaveQueries, canManageLeave, type LeaveFilter } from '@backoffice/core';
import { requestStatusSchema } from '@backoffice/contracts';
import { csvDownload, exportReason, forbidden, invalidInput, withSessionAndDatabase } from '../leave-route';

const COLUMNS = ['reference', 'display_name', 'organization', 'leave_type', 'kind', 'start_date', 'start_half', 'end_date', 'end_half', 'days', 'status', 'submitted_at'];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const cell = (value: string) => { const safe = /^[=+\-@]/.test(value) ? `'${value}` : value; return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };

/** Every ใบลา in a date range for HR, as CSV. Reasons and contacts never leave the leave pages. */
export async function GET(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const status = url.searchParams.get('status');
    const reason = exportReason(url);
    const bad = [...(datePattern.test(from) ? [] : ['from']), ...(datePattern.test(to) ? [] : ['to']), ...(status && !requestStatusSchema.safeParse(status).success ? ['status'] : []), ...(reason ? [] : ['reason'])];
    if (bad.length > 0) return invalidInput(bad);
    const filter: LeaveFilter = { from, to };
    for (const key of ['organizationId', 'leaveTypeId'] as const) { const value = url.searchParams.get(key); if (value) filter[key] = value; }
    if (status) filter.status = requestStatusSchema.parse(status);
    return csvDownload(database, { actorPersonId: session.personId, reason: reason!, scope: { ...filter, dataset: 'leave' } }, `leave-${from}-${to}.csv`, async () => {
      const rows = (await new LeaveQueries(database).allLeave(filter)).map((item) => [item.reference, item.personDisplayName ?? '', item.organizationName ?? '', item.leaveTypeName, item.kind, item.startDate, item.startHalf, item.endDate, item.endHalf, String(item.days), item.status, item.submittedAt ?? ''].map(cell).join(','));
      return `\uFEFF${[COLUMNS.join(','), ...rows].join('\r\n')}\r\n`;
    });
  });
}
