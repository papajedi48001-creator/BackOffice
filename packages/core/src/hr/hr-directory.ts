import type { OrganizationUnitType } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export interface DirectoryPerson { id: string; employeeCode: string | null; displayName: string | null; positionTitle: string | null; employmentStatus: string; nationalIdMasked: string | null; organizationName: string | null; organizationCode: string | null; }
export interface DirectoryOrganization { id: string; code: string | null; name: string; parentId: string | null; activePeople: number; unitType: OrganizationUnitType | null; headPersonId: string | null; headDisplayName: string | null; }
export interface OrganizationHeadTerm { personId: string; displayName: string | null; employeeCode: string | null; effectiveFrom: string; effectiveUntil: string | null; }
export interface OrganizationDetail { id: string; code: string | null; name: string; unitType: OrganizationUnitType | null; headPersonId: string | null; headHistory: OrganizationHeadTerm[]; }
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
      `SELECT o.id, o.code, o.name, o.parent_id AS parentId, o.unit_type AS unitType, h.person_id AS headPersonId, hp.display_name AS headDisplayName, COUNT(p.id) AS activePeople
       FROM organization o
       LEFT JOIN hr_organization_head h ON h.organization_id = o.id AND h.effective_from <= UTC_TIMESTAMP() AND (h.effective_until IS NULL OR h.effective_until > UTC_TIMESTAMP())
       LEFT JOIN person hp ON hp.id = h.person_id
       LEFT JOIN employment_assignment a ON a.organization_id = o.id AND a.effective_until IS NULL
       LEFT JOIN person p ON p.id = a.person_id AND p.employment_status = 'ACTIVE'
       GROUP BY o.id, o.code, o.name, o.parent_id, o.unit_type, h.person_id, hp.display_name
       ORDER BY o.name`
    );
    return rows.map((row) => ({ ...row, activePeople: Number(row.activePeople) }));
  }
  async getOrganization(id: string): Promise<OrganizationDetail | null> {
    const [organization] = await this.database.query<Omit<OrganizationDetail, 'headPersonId' | 'headHistory'>>('SELECT id, code, name, unit_type AS unitType FROM organization WHERE id = ?', [id]);
    if (!organization) return null;
    // Timestamps are formatted in SQL so the driver's local time zone never shifts them.
    const headHistory = await this.database.query<OrganizationHeadTerm>(
      `SELECT h.person_id AS personId, p.display_name AS displayName, p.employee_code AS employeeCode,
         DATE_FORMAT(h.effective_from, '%Y-%m-%dT%H:%i:%sZ') AS effectiveFrom, DATE_FORMAT(h.effective_until, '%Y-%m-%dT%H:%i:%sZ') AS effectiveUntil
       FROM hr_organization_head h LEFT JOIN person p ON p.id = h.person_id
       WHERE h.organization_id = ? ORDER BY h.effective_from DESC, h.created_at DESC`, [id]);
    const now = new Date();
    const current = headHistory.find((term) => new Date(term.effectiveFrom) <= now && (term.effectiveUntil === null || new Date(term.effectiveUntil) > now));
    return { ...organization, headPersonId: current?.personId ?? null, headHistory };
  }
}
