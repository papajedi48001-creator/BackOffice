import { peopleExportCriteriaSchema } from '@backoffice/contracts';
import { AuthorizationService, HrDirectory, exportPeople } from '@backoffice/core';
import { bangkokToday } from '../../../../../lib/bangkok-time';
import { filterPeople } from '../../../../../lib/people-filter';
import { forbidden, readInput, withSessionAndDatabase } from '../../profile-route';

/**
 * ส่งออกข้อมูลทะเบียนบุคลากร as CSV: hospital-wide `data.export` for HR, rows limited to the actor's `hr.person.read` units,
 * then the same search and filters as the page. The search arrives in the body, never in the URL. Every download is audited.
 */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const authorization = new AuthorizationService();
    if (!authorization.canActHospitalWide(session, 'data.export', 'hr')) return forbidden();
    const scope = authorization.organizationScope(session, 'hr.person.read');
    if (scope !== 'all' && scope.length === 0) return forbidden();
    const criteria = await readInput(request, peopleExportCriteriaSchema);
    if (!criteria.ok) return criteria.response;
    const people = filterPeople(await new HrDirectory(database).listPeople({ organizationIds: scope }), criteria.value);
    const csv = await exportPeople(database, session.personId, people);
    return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="people-${bangkokToday()}.csv"`, 'cache-control': 'no-store' } });
  });
}
