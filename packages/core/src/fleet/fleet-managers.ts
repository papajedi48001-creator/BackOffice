import type { Database } from '@backoffice/db';
import { roleGrantsPermission } from '../access/policy';

/** Active people holding a hospital-wide role that grants `fleet.manage` (the check `canManageFleet` makes); distinct and sorted. */
export async function fleetManagerPersonIds(database: Database): Promise<string[]> {
  const rows = await database.query<{ personId: string; roleName: string }>(
    'SELECT DISTINCT a.person_id AS personId, r.name AS roleName FROM role_assignment a JOIN role r ON r.id = a.role_id JOIN person p ON p.id = a.person_id WHERE a.organization_id IS NULL AND p.employment_status = \'ACTIVE\''
  );
  return [...new Set(rows.filter((row) => roleGrantsPermission(row.roleName, 'fleet.manage')).map((row) => row.personId))].sort();
}
