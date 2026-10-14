import type { Database } from '@backoffice/db';

export interface DirectoryPerson { id: string; employeeCode: string | null; displayName: string | null; positionTitle: string | null; employmentStatus: string; nationalIdMasked: string | null; organizationName: string | null; organizationCode: string | null; }
export interface DirectoryOrganization { id: string; code: string | null; name: string; parentId: string | null; activePeople: number; }
/** `all` for a hospital-wide reader; otherwise the organizations a scoped role covers. */
export interface DirectoryScope { organizationIds: 'all' | string[]; }

export class HrDirectory {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async listPeople(scope: DirectoryScope): Promise<DirectoryPerson[]> {
    if (scope.organizationIds !== 'all' && scope.organizationIds.length === 0) return [];
    const scoped = scope.organizationIds === 'all' ? '' : `WHERE a.organization_id IN (${scope.organizationIds.map(() => '?').join(', ')})`;
    return this.database.query<DirectoryPerson>(
      `SELECT p.id, p.employee_code AS employeeCode, p.display_name AS displayName, p.position_title AS positionTitle, p.employment_status AS employmentStatus, p.national_id_masked AS nationalIdMasked, o.name AS organizationName, o.code AS organizationCode
       FROM person p
       ${scope.organizationIds === 'all' ? 'LEFT' : ''} JOIN employment_assignment a ON a.person_id = p.id AND a.effective_until IS NULL
       LEFT JOIN organization o ON o.id = a.organization_id
       ${scoped}
       ORDER BY o.name, p.display_name, p.employee_code`,
      scope.organizationIds === 'all' ? [] : scope.organizationIds
    );
  }

  async listOrganizations(): Promise<DirectoryOrganization[]> {
    const rows = await this.database.query<DirectoryOrganization & { activePeople: number | string }>(
      `SELECT o.id, o.code, o.name, o.parent_id AS parentId, COUNT(p.id) AS activePeople
       FROM organization o
       LEFT JOIN employment_assignment a ON a.organization_id = o.id AND a.effective_until IS NULL
       LEFT JOIN person p ON p.id = a.person_id AND p.employment_status = 'ACTIVE'
       GROUP BY o.id, o.code, o.name, o.parent_id
       ORDER BY o.name`
    );
    return rows.map((row) => ({ ...row, activePeople: Number(row.activePeople) }));
  }
}
