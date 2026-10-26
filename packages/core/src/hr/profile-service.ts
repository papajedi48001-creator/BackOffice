import { randomUUID } from 'node:crypto';
import { updatePersonContactInputSchema, updatePersonProfileInputSchema, type AccessSubject, type Gender, type UpdatePersonContactInput, type UpdatePersonProfileInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { toMariaDbDatetime } from '../rooms/database-room-booking-repository';
import { diffProfile, resolveGender } from './profile-changes';
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
const workFields = ['employmentType', 'appointedOn', 'positionTitle', 'positionLevel', 'organization'] as const;
const contactFields = ['phone', 'address', 'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'] as const;
const profileColumns = {
  namePrefix: 'name_prefix', firstName: 'first_name', lastName: 'last_name', gender: 'gender', birthDate: 'birth_date', phone: 'phone', address: 'address',
  emergencyContactName: 'emergency_contact_name', emergencyContactRelationship: 'emergency_contact_relationship', emergencyContactPhone: 'emergency_contact_phone',
  employmentTypeId: 'employment_type_id', appointedOn: 'appointed_on', positionLevel: 'position_level'
} as const;
type ProfileColumn = keyof typeof profileColumns;
type StoredProfile = Record<ProfileColumn, string | null>;
type QueryDatabase = Pick<Database, 'query' | 'execute'>;
export type ProfileSubject = { personId: string; organizationId: string | null; assignmentId: string | null; managerPersonId: string | null; organizationName: string | null; positionTitle: string | null };

export type UpdateProfileResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'GENDER_REQUIRED' | 'UNKNOWN_EMPLOYMENT_TYPE' | 'INACTIVE_EMPLOYMENT_TYPE' | 'UNKNOWN_ORGANIZATION' };
export type UpdateContactResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' };

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

  async updateProfile(personId: string, input: UpdatePersonProfileInput, actor: AccessSubject): Promise<UpdateProfileResult> {
    const valid = updatePersonProfileInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateProfileResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editProfile) return { ok: false, code: 'FORBIDDEN' };
      return applyProfileUpdate(database, subject, valid, actor.personId!, this.createId, {
        canEditOrganization: (organizationId) => profileAccess(actor, { personId, organizationId }).editProfile,
        syncDisplayName: true
      });
    }, { isolationLevel: 'READ COMMITTED' });
  }

  async updateContact(personId: string, input: UpdatePersonContactInput, actor: AccessSubject): Promise<UpdateContactResult> {
    const valid = updatePersonContactInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateContactResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editContact) return { ok: false, code: 'FORBIDDEN' };
      const stored = await readStoredProfile(database, personId);
      const changes = diffProfile(pick(stored, contactFields) as Record<string, string | null>, pick(valid, contactFields), []);
      if (changes.changedFields.length === 0) return { ok: true };
      await writeProfile(database, personId, { ...stored, ...defined(pick(valid, contactFields)) });
      await recordProfileAudit(database, 'hr.person.contact.update', personId, actor.personId ?? null, changes, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

}

/**
 * Writes personal and work fields for a person whose row the caller already locked, with one audit event.
 * Access is the caller's job; the master data import calls this inside its own transaction.
 */
export async function applyProfileUpdate(database: QueryDatabase, subject: ProfileSubject, valid: UpdatePersonProfileInput, actorPersonId: string, createId: () => string, options: { canEditOrganization: (organizationId: string) => boolean; syncDisplayName: boolean }): Promise<UpdateProfileResult> {
  const stored = await readStoredProfile(database, subject.personId);
  let employmentTypeName = stored.employmentTypeId ? await employmentTypeNameOf(database, stored.employmentTypeId) : null;
  const before: Record<string, string | null> = { ...pick(stored, ['namePrefix', 'firstName', 'lastName', 'gender', 'birthDate', 'appointedOn', 'positionLevel']) as Record<string, string | null>, employmentType: employmentTypeName, positionTitle: subject.positionTitle, organization: subject.organizationName };
  if (valid.employmentTypeId !== undefined && valid.employmentTypeId !== stored.employmentTypeId) {
    if (valid.employmentTypeId === null) employmentTypeName = null;
    else {
      const [type] = await database.query<{ name: string; isActive: number }>('SELECT name, is_active AS isActive FROM hr_employment_type WHERE id = ?', [valid.employmentTypeId]);
      if (!type) return { ok: false, code: 'UNKNOWN_EMPLOYMENT_TYPE' };
      if (!type.isActive) return { ok: false, code: 'INACTIVE_EMPLOYMENT_TYPE' };
      employmentTypeName = type.name;
    }
  }
  let organizationName = subject.organizationName;
  if (valid.organizationId !== undefined && valid.organizationId !== subject.organizationId) {
    const [target] = await database.query<{ name: string }>('SELECT name FROM organization WHERE id = ?', [valid.organizationId]);
    if (!target) return { ok: false, code: 'UNKNOWN_ORGANIZATION' };
    if (!options.canEditOrganization(valid.organizationId)) return { ok: false, code: 'FORBIDDEN' };
    organizationName = target.name;
  }
  const gender = resolveGender(valid.namePrefix, valid.gender, { namePrefix: stored.namePrefix, gender: stored.gender as Gender | null });
  if (gender === 'GENDER_REQUIRED') return { ok: false, code: 'GENDER_REQUIRED' };
  const after: Record<string, string | null | undefined> = {
    namePrefix: valid.namePrefix, firstName: valid.firstName, lastName: valid.lastName, gender, birthDate: valid.birthDate,
    employmentType: valid.employmentTypeId === undefined ? undefined : employmentTypeName, appointedOn: valid.appointedOn,
    positionTitle: valid.positionTitle, positionLevel: valid.positionLevel, organization: valid.organizationId === undefined ? undefined : organizationName
  };
  const changes = diffProfile(before, after, workFields);
  if (changes.changedFields.length === 0) return { ok: true };
  const merged: StoredProfile = { ...stored, ...defined(pick(valid, ['namePrefix', 'firstName', 'lastName', 'birthDate', 'employmentTypeId', 'appointedOn', 'positionLevel'])), gender };
  await writeProfile(database, subject.personId, merged);
  if (options.syncDisplayName && ['namePrefix', 'firstName', 'lastName'].some((field) => changes.changedFields.includes(field)) && (merged.firstName || merged.lastName)) {
    await database.execute('UPDATE person SET display_name = ? WHERE id = ?', [`${merged.namePrefix ?? ''}${merged.firstName ?? ''} ${merged.lastName ?? ''}`.trim(), subject.personId]);
  }
  if (changes.changedFields.includes('positionTitle')) await database.execute('UPDATE person SET position_title = ? WHERE id = ?', [valid.positionTitle ?? null, subject.personId]);
  if (changes.changedFields.includes('organization') && valid.organizationId) await moveAssignment(database, subject, valid.organizationId, createId);
  await recordProfileAudit(database, 'hr.person.profile.update', subject.personId, actorPersonId, changes, createId);
  return { ok: true };
}

function recordProfileAudit(database: QueryDatabase, action: string, personId: string, actorPersonId: string | null, changes: { changedFields: string[]; workChanges: WorkChanges }, createId: () => string): Promise<void> {
  const metadata = Object.keys(changes.workChanges).length > 0 ? changes : { changedFields: changes.changedFields };
  return new AuditService(new DatabaseAuditRepository(database), createId).recordAudit({ actorPersonId, action, targetType: 'person', targetId: personId, result: 'SUCCESS', metadata });
}

/** Locks the person row, which serialises profile saves, and reads the open assignment. */
export async function lockProfileSubject(database: QueryDatabase, personId: string, options: { organizationsLocked?: boolean } = {}): Promise<ProfileSubject | null> {
  // A master data import locks every organization and then every person. Taking the organizations first here too
  // (shared, so profile saves do not block each other) keeps the same order, so a save and an import cannot deadlock
  // over the person row and the organization or actor rows that foreign keys check. The primary key is forced because a
  // shared lock through a covering secondary index would not touch the primary rows the import locks.
  if (!options.organizationsLocked) await database.query('SELECT id FROM organization FORCE INDEX (PRIMARY) LOCK IN SHARE MODE');
  const [person] = await database.query<{ positionTitle: string | null }>('SELECT position_title AS positionTitle FROM person WHERE id = ? FOR UPDATE', [personId]);
  if (!person) return null;
  const [assignment] = await database.query<{ id: string; organizationId: string; managerPersonId: string | null; organizationName: string | null }>(
    `SELECT a.id, a.organization_id AS organizationId, a.manager_person_id AS managerPersonId, o.name AS organizationName
     FROM employment_assignment a LEFT JOIN organization o ON o.id = a.organization_id
     WHERE a.person_id = ? AND a.effective_until IS NULL ORDER BY a.effective_from DESC LIMIT 1`, [personId]);
  return { personId, positionTitle: person.positionTitle, assignmentId: assignment?.id ?? null, organizationId: assignment?.organizationId ?? null, managerPersonId: assignment?.managerPersonId ?? null, organizationName: assignment?.organizationName ?? null };
}

async function readStoredProfile(database: QueryDatabase, personId: string): Promise<StoredProfile> {
  const select = (Object.entries(profileColumns) as [ProfileColumn, string][])
    .map(([field, column]) => column === 'birth_date' || column === 'appointed_on' ? `DATE_FORMAT(${column}, '%Y-%m-%d') AS ${field}` : `${column} AS ${field}`).join(', ');
  const [row] = await database.query<StoredProfile>(`SELECT ${select} FROM hr_person_profile WHERE person_id = ?`, [personId]);
  return row ?? Object.fromEntries(Object.keys(profileColumns).map((field) => [field, null])) as StoredProfile;
}

async function writeProfile(database: QueryDatabase, personId: string, profile: StoredProfile): Promise<void> {
  const fields = Object.keys(profileColumns) as ProfileColumn[];
  const columns = fields.map((field) => profileColumns[field]);
  await database.execute(
    `INSERT INTO hr_person_profile (person_id, ${columns.join(', ')}, updated_at) VALUES (?, ${columns.map(() => '?').join(', ')}, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE ${columns.map((column) => `${column} = VALUES(${column})`).join(', ')}, updated_at = VALUES(updated_at)`,
    [personId, ...fields.map((field) => profile[field])]);
}

async function employmentTypeNameOf(database: QueryDatabase, id: string): Promise<string | null> {
  const [type] = await database.query<{ name: string }>('SELECT name FROM hr_employment_type WHERE id = ?', [id]);
  return type?.name ?? null;
}

async function moveAssignment(database: QueryDatabase, subject: ProfileSubject, organizationId: string, createId: () => string): Promise<void> {
  const now = toMariaDbDatetime(new Date());
  if (subject.assignmentId) await database.execute('UPDATE employment_assignment SET effective_until = ? WHERE person_id = ? AND effective_until IS NULL', [now, subject.personId]);
  await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, ?, ?, NULL, UTC_TIMESTAMP())', [createId(), subject.personId, organizationId, subject.managerPersonId, now]);
}

function pick<T extends object, K extends string>(source: T, keys: readonly K[]): Record<K, string | null | undefined> {
  return Object.fromEntries(keys.map((key) => [key, (source as Record<string, string | null | undefined>)[key]])) as Record<K, string | null | undefined>;
}

function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}
