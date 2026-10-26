import { LeaveSettingsService, canManageLeave } from '@backoffice/core';
import { leaveHolidayInputSchema } from '@backoffice/contracts';
import { forbidden, invalidInput, leaveResult, readInput, withSessionAndDatabase } from '../../leave-route';

const renameSchema = leaveHolidayInputSchema.pick({ name: true }).strict();
const isDate = (value: string) => leaveHolidayInputSchema.shape.date.safeParse(value).success;

export async function PUT(request: Request, context: { params: Promise<{ date: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const { date } = await context.params;
    if (!isDate(date)) return invalidInput(['date']);
    const input = await readInput(request, renameSchema);
    if (!input.ok) return input.response;
    return leaveResult(await new LeaveSettingsService(database).renameHoliday(date, input.value.name, session.personId));
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ date: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!canManageLeave(session)) return forbidden();
    const { date } = await context.params;
    if (!isDate(date)) return invalidInput(['date']);
    return leaveResult(await new LeaveSettingsService(database).deleteHoliday(date, session.personId));
  });
}
