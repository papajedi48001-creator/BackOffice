import { randomUUID } from 'node:crypto';
import type { AccessSubject, Gender } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { profileAccess, type ProfileAccess } from './profile-access';

export interface ProfileWork {
  personId: string; employeeCode: string | null; displayName: string | null; employmentStatus: string;
  organizationId: string | null; organizationName: string | null; positionTitle: string | null; positionLevel: string | null;
  employmentTypeId: string | null; employmentTypeName: string | null; appointedOn: string | null;
}
export interface ProfilePrivate {
  namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null;
  phone: string | null; address: string | null; emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null;
}
export type WorkChanges = Record<string, { from: string | null; to: string | null }>;
export interface ProfileChange { at: string; actorDisplayName: string | null; action: string; changedFields: string[]; workChanges: WorkChanges; }
export interface ProfileView { work: ProfileWork; private: ProfilePrivate | null; access: ProfileAccess; history: ProfileChange[]; }

export const profileAuditActions = ['hr.person.profile.update', 'hr.person.contact.update'] as const;
const historyLimit = 50;

/** Reads and edits a บุคลากร's profile. Private columns are only selected for a viewer allowed to see them. */
export class HrProfileService {
  constructor(protected readonly database: Pick<Database, 'query' | 'transaction'>, protected readonly createId: () => string = randomUUID) {}

  async get(personId: string, viewer: AccessSubject): Promise<ProfileView | 'NOT_FOUND' | 'FORBIDDEN'> {
    const [work] = await this.database.query<ProfileWork>(
      `SELECT p.id AS personId, p.employee_code AS employeeCode, p.display_name AS displayName, p.employment_status AS employmentStatus,
         a.organization_id AS organizationId, o.name AS organizationName, p.position_title AS positionTitle, pr.position_level AS positionLevel,
         pr.employment_type_id AS employmentTypeId, t.name AS employmentTypeName, DATE_FORMAT(pr.appointed_on, '%Y-%m-%d') AS appointedOn
       FROM person p
       LEFT JOIN employment_assignment a ON a.id = (SELECT latest.id FROM employment_assignment latest WHERE latest.person_id = p.id AND latest.effective_until IS NULL ORDER BY latest.effective_from DESC LIMIT 1)
       LEFT JOIN organization o ON o.id = a.organization_id
       LEFT JOIN hr_person_profile pr ON pr.person_id = p.id
       LEFT JOIN hr_employment_type t ON t.id = pr.employment_type_id
       WHERE p.id = ?`, [personId]);
    if (!work) return 'NOT_FOUND';
    const access = profileAccess(viewer, { personId, organizationId: work.organizationId });
    if (!access.viewWork) return 'FORBIDDEN';
    return { work, private: access.viewPrivate ? await this.readPrivate(personId) : null, access, history: await this.readHistory(personId) };
  }

  /** Employment facts the leave and official-travel modules need. */
  async getEmployment(personId: string): Promise<{ employmentTypeCode: string | null; appointedOn: string | null } | null> {
    const [row] = await this.database.query<{ employmentTypeCode: string | null; appointedOn: string | null }>(
      `SELECT t.code AS employmentTypeCode, DATE_FORMAT(pr.appointed_on, '%Y-%m-%d') AS appointedOn
       FROM person p LEFT JOIN hr_person_profile pr ON pr.person_id = p.id LEFT JOIN hr_employment_type t ON t.id = pr.employment_type_id WHERE p.id = ?`, [personId]);
    return row ?? null;
  }

  private async readPrivate(personId: string): Promise<ProfilePrivate> {
    const [row] = await this.database.query<ProfilePrivate>(
      `SELECT name_prefix AS namePrefix, first_name AS firstName, last_name AS lastName, gender, DATE_FORMAT(birth_date, '%Y-%m-%d') AS birthDate,
         phone, address, emergency_contact_name AS emergencyContactName, emergency_contact_relationship AS emergencyContactRelationship, emergency_contact_phone AS emergencyContactPhone
       FROM hr_person_profile WHERE person_id = ?`, [personId]);
    return row ?? { namePrefix: null, firstName: null, lastName: null, gender: null, birthDate: null, phone: null, address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null };
  }

  private async readHistory(personId: string): Promise<ProfileChange[]> {
    // Timestamps are formatted in SQL so the driver's local time zone never shifts them.
    const rows = await this.database.query<{ at: string; actorDisplayName: string | null; action: string; metadata: string }>(
      `SELECT DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%sZ') AS at, actor.display_name AS actorDisplayName, e.action, e.metadata
       FROM audit_event e LEFT JOIN person actor ON actor.id = e.actor_person_id
       WHERE e.target_type = 'person' AND e.target_id = ? AND e.action IN (${profileAuditActions.map(() => '?').join(', ')})
       ORDER BY e.created_at DESC LIMIT ${historyLimit}`, [personId, ...profileAuditActions]);
    return rows.map(({ metadata, ...row }) => {
      const parsed = JSON.parse(metadata) as { changedFields?: string[]; workChanges?: WorkChanges };
      return { ...row, changedFields: parsed.changedFields ?? [], workChanges: parsed.workChanges ?? {} };
    });
  }
}
