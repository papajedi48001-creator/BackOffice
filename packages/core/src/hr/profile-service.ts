import { randomUUID } from 'node:crypto';
import { levelAllowed, MAX_KP7_FILE_BYTES, MAX_PROFILE_PHOTO_BYTES, profilePhotoContentTypeSchema, updateOwnPersonalInputSchema, updatePersonContactInputSchema, updatePersonFamilyInputSchema, updatePersonProfileInputSchema, type AccessSubject, type Gender, type MaritalStatus, type UpdateOwnPersonalInput, type UpdatePersonContactInput, type UpdatePersonFamilyInput, type GpfStatus, type UpdateCivilServiceInput, type UpdateEducationInput, type UpdatePositionHistoryInput, updatePositionHistoryInputSchema, updateCivilServiceInputSchema, updateEducationInputSchema, retirementDate, type UpdatePersonProfileInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { toMariaDbDatetime } from '../rooms/database-room-booking-repository';
import { levelsOf } from './position-catalog-service';
import { diffProfile, resolveGender } from './profile-changes';
import { profileAccess, type ProfileAccess } from './profile-access';

export interface ProfileWork {
  personId: string; employeeCode: string | null; displayName: string | null; employmentStatus: string;
  organizationId: string | null; organizationName: string | null; positionTitle: string | null; positionLevel: string | null;
  employmentTypeId: string | null; employmentTypeName: string | null; appointedOn: string | null; photoAttachmentId: string | null;
}
export interface ProfilePrivate {
  namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null;
  phone: string | null; address: string | null; emergencyContactName: string | null; emergencyContactRelationship: string | null; emergencyContactPhone: string | null;
  maritalStatus: MaritalStatus | null; religion: string | null; birthplace: string | null; fatherName: string | null; motherName: string | null; motherMaidenName: string | null;
  spouseName: string | null; spouseMaidenName: string | null; childrenCount: number | null;
  /** The ก.พ.7 PDF, opened through the attachment download route. */
  kp7File: { attachmentId: string; uploadedAt: string } | null;
  civilService: CivilServiceView;
  education: EducationEntryView[];
  positionHistory: PositionHistoryView[];
}
export interface CivilServiceView {
  positionNumber: string | null; salary: number | null; parentAgency: string | null; gpfStatus: GpfStatus | null; firstAppointedOn: string | null; reappointedOn: string | null;
  transferredInOn: string | null; transferredOutOn: string | null; joinedUnitOn: string | null; currentLevelSince: string | null; qualification: string | null; qualificationMajor: string | null;
  specialAllowance: string | null; retirementDate: string | null;
}
export interface EducationEntryView { graduatedOn: string | null; degree: string; major: string | null; institution: string | null; country: string | null }
export interface PositionHistoryView { effectiveOn: string; description: string; positionNumber: string | null; positionType: string | null; level: string | null; salary: number | null; positionAllowance: number | null; reference: string | null }
export type WorkChanges = Record<string, { from: string | null; to: string | null }>;
export interface ProfileChange { at: string; actorDisplayName: string | null; action: string; changedFields: string[]; workChanges: WorkChanges; }
export interface ProfileView { work: ProfileWork; private: ProfilePrivate | null; access: ProfileAccess; history: ProfileChange[]; }

export const profileAuditActions = ['hr.person.profile.update', 'hr.person.personal.update', 'hr.person.contact.update', 'hr.person.photo.update', 'hr.person.family.update', 'hr.person.kp7.update', 'hr.person.civil.update', 'hr.person.education.update', 'hr.person.position-history.update'] as const;
const historyLimit = 50;
const workFields = ['employmentType', 'appointedOn', 'positionTitle', 'positionLevel', 'organization'] as const;
const contactFields = ['phone', 'address', 'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'] as const;
const profileColumns = {
  namePrefix: 'name_prefix', firstName: 'first_name', lastName: 'last_name', gender: 'gender', birthDate: 'birth_date', phone: 'phone', address: 'address',
  emergencyContactName: 'emergency_contact_name', emergencyContactRelationship: 'emergency_contact_relationship', emergencyContactPhone: 'emergency_contact_phone',
  employmentTypeId: 'employment_type_id', appointedOn: 'appointed_on', positionLevel: 'position_level', positionId: 'position_id',
  maritalStatus: 'marital_status', religion: 'religion', birthplace: 'birthplace', fatherName: 'father_name', motherName: 'mother_name',
  motherMaidenName: 'mother_maiden_name', spouseName: 'spouse_name', spouseMaidenName: 'spouse_maiden_name', childrenCount: 'children_count',
  positionNumber: 'position_number', salary: 'salary', parentAgency: 'parent_agency', gpfStatus: 'gpf_status', firstAppointedOn: 'first_appointed_on', reappointedOn: 'reappointed_on',
  transferredInOn: 'transferred_in_on', transferredOutOn: 'transferred_out_on', joinedUnitOn: 'joined_unit_on', currentLevelSince: 'current_level_since',
  qualification: 'qualification', qualificationMajor: 'qualification_major', specialAllowance: 'special_allowance'
} as const;
const dateColumns = new Set(['birth_date', 'appointed_on', 'first_appointed_on', 'reappointed_on', 'transferred_in_on', 'transferred_out_on', 'joined_unit_on', 'current_level_since']);
/** ข้อมูลการปฏิบัติราชการ on the ก.พ.7; HR only. */
const civilServiceFields = ['positionNumber', 'salary', 'parentAgency', 'gpfStatus', 'firstAppointedOn', 'reappointedOn', 'transferredInOn', 'transferredOutOn', 'joinedUnitOn', 'currentLevelSince', 'qualification', 'qualificationMajor', 'specialAllowance'] as const;
/** ข้อมูลส่วนตัวและครอบครัว on the ก.พ.7. */
const familyFields = ['maritalStatus', 'religion', 'birthplace', 'fatherName', 'motherName', 'motherMaidenName', 'spouseName', 'spouseMaidenName', 'childrenCount'] as const;
type ProfileColumn = keyof typeof profileColumns;
type StoredProfile = Record<ProfileColumn, string | null>;
type QueryDatabase = Pick<Database, 'query' | 'execute'>;
export type ProfileSubject = { personId: string; organizationId: string | null; assignmentId: string | null; managerPersonId: string | null; organizationName: string | null; positionTitle: string | null };

export type UpdateProfileResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'GENDER_REQUIRED' | 'UNKNOWN_EMPLOYMENT_TYPE' | 'INACTIVE_EMPLOYMENT_TYPE' | 'UNKNOWN_ORGANIZATION' | 'UNKNOWN_POSITION' | 'INACTIVE_POSITION' | 'LEVEL_NOT_ALLOWED' };
export type UpdateContactResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' };
export type UpdateOwnPersonalResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'GENDER_REQUIRED' };
export type UpdateFamilyResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' };
export type UpdateCivilServiceResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' };
export type UpdateEducationResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' };
export type SetKp7FileResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_FILE' };
export type SetPhotoResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_PHOTO' };

const isSelf = (actor: AccessSubject, personId: string) => actor.authenticated && actor.personId === personId;

/** Reads and edits a บุคลากร's profile. Private columns are only selected for a viewer allowed to see them. */
export class HrProfileService {
  constructor(protected readonly database: Pick<Database, 'query' | 'transaction'>, protected readonly createId: () => string = randomUUID) {}

  async get(personId: string, viewer: AccessSubject): Promise<ProfileView | 'NOT_FOUND' | 'FORBIDDEN'> {
    const [work] = await this.database.query<ProfileWork>(
      `SELECT p.id AS personId, p.employee_code AS employeeCode, p.display_name AS displayName, p.employment_status AS employmentStatus,
         a.organization_id AS organizationId, o.name AS organizationName, p.position_title AS positionTitle, pr.position_level AS positionLevel,
         pr.employment_type_id AS employmentTypeId, t.name AS employmentTypeName, DATE_FORMAT(pr.appointed_on, '%Y-%m-%d') AS appointedOn, pr.photo_attachment_id AS photoAttachmentId
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
    const [row] = await this.database.query<Omit<ProfilePrivate, 'kp7File' | 'childrenCount' | 'civilService' | 'education'> & { childrenCount: number | string | null; kp7AttachmentId: string | null; kp7UploadedAt: string | null }>(
      `SELECT pr.name_prefix AS namePrefix, pr.first_name AS firstName, pr.last_name AS lastName, pr.gender, DATE_FORMAT(pr.birth_date, '%Y-%m-%d') AS birthDate,
         pr.phone, pr.address, pr.emergency_contact_name AS emergencyContactName, pr.emergency_contact_relationship AS emergencyContactRelationship, pr.emergency_contact_phone AS emergencyContactPhone,
         pr.marital_status AS maritalStatus, pr.religion, pr.birthplace, pr.father_name AS fatherName, pr.mother_name AS motherName, pr.mother_maiden_name AS motherMaidenName,
         pr.spouse_name AS spouseName, pr.spouse_maiden_name AS spouseMaidenName, pr.children_count AS childrenCount,
         pr.kp7_attachment_id AS kp7AttachmentId, DATE_FORMAT(k.created_at, '%Y-%m-%dT%H:%i:%sZ') AS kp7UploadedAt
       FROM hr_person_profile pr LEFT JOIN attachment k ON k.id = pr.kp7_attachment_id WHERE pr.person_id = ?`, [personId]);
    const stored = await readStoredProfile(this.database, personId);
    const civilService = { ...Object.fromEntries(civilServiceFields.map((field) => [field, stored[field] ?? null])), salary: stored.salary === null ? null : Number(stored.salary), retirementDate: retirementDate(row?.birthDate ?? null) } as CivilServiceView;
    const education = await this.database.query<EducationEntryView>(
      "SELECT DATE_FORMAT(graduated_on, '%Y-%m-%d') AS graduatedOn, degree, major, institution, country FROM hr_person_education WHERE person_id = ? ORDER BY sequence", [personId]);
    const positionHistory = await readPositionHistory(this.database, personId);
    if (!row) return { namePrefix: null, firstName: null, lastName: null, gender: null, birthDate: null, phone: null, address: null, emergencyContactName: null, emergencyContactRelationship: null, emergencyContactPhone: null,
      maritalStatus: null, religion: null, birthplace: null, fatherName: null, motherName: null, motherMaidenName: null, spouseName: null, spouseMaidenName: null, childrenCount: null, kp7File: null, civilService, education, positionHistory };
    const { kp7AttachmentId, kp7UploadedAt, childrenCount, ...rest } = row;
    return { ...rest, childrenCount: childrenCount === null ? null : Number(childrenCount), kp7File: kp7AttachmentId ? { attachmentId: kp7AttachmentId, uploadedAt: kp7UploadedAt! } : null, civilService, education, positionHistory };
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
        syncDisplayName: true, checkPosition: true
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

  /** The person's own ข้อมูลส่วนตัว (prefix, names, gender, birth date). Nobody edits another person's through this; HR uses updateProfile. */
  async updateOwnPersonal(personId: string, input: UpdateOwnPersonalInput, actor: AccessSubject): Promise<UpdateOwnPersonalResult> {
    const valid = updateOwnPersonalInputSchema.parse(input);
    if (!isSelf(actor, personId)) return { ok: false, code: 'FORBIDDEN' };
    return this.database.transaction(async (database): Promise<UpdateOwnPersonalResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      const result = await applyProfileUpdate(database, subject, valid, personId, this.createId, { canEditOrganization: () => false, syncDisplayName: true, auditAction: 'hr.person.personal.update' });
      return result.ok || result.code === 'NOT_FOUND' || result.code === 'FORBIDDEN' || result.code === 'GENDER_REQUIRED' ? result as UpdateOwnPersonalResult : { ok: false, code: 'FORBIDDEN' };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** ข้อมูลส่วนตัวและครอบครัว (ก.พ.7): the person themself or HR. The audit names the changed fields, never their values. */
  async updateFamily(personId: string, input: UpdatePersonFamilyInput, actor: AccessSubject): Promise<UpdateFamilyResult> {
    const valid = updatePersonFamilyInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateFamilyResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editContact) return { ok: false, code: 'FORBIDDEN' };
      const stored = await readStoredProfile(database, personId);
      const asText = (value: string | number | null | undefined) => value === undefined || value === null ? value : String(value);
      const before = Object.fromEntries(familyFields.map((field) => [field, asText(stored[field])])) as Record<string, string | null>;
      const after = Object.fromEntries(familyFields.map((field) => [field, asText(valid[field])]));
      const changes = diffProfile(before, after, []);
      if (changes.changedFields.length === 0) return { ok: true };
      await writeProfile(database, personId, { ...stored, ...defined(after) });
      await recordProfileAudit(database, 'hr.person.family.update', personId, actor.personId ?? null, changes, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** ข้อมูลการปฏิบัติราชการ (ก.พ.7): HR only, as it records official orders. The audit names fields, never the salary or dates. */
  async updateCivilService(personId: string, input: UpdateCivilServiceInput, actor: AccessSubject): Promise<UpdateCivilServiceResult> {
    const valid = updateCivilServiceInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateCivilServiceResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editProfile) return { ok: false, code: 'FORBIDDEN' };
      const stored = await readStoredProfile(database, personId);
      const asText = (field: string, value: string | number | null | undefined) => value === undefined || value === null ? value : field === 'salary' ? Number(value).toFixed(2) : String(value);
      const before = Object.fromEntries(civilServiceFields.map((field) => [field, asText(field, stored[field])])) as Record<string, string | null>;
      const after = Object.fromEntries(civilServiceFields.map((field) => [field, asText(field, valid[field])]));
      const changes = diffProfile(before, after, []);
      if (changes.changedFields.length === 0) return { ok: true };
      await writeProfile(database, personId, { ...stored, ...defined(after) });
      await recordProfileAudit(database, 'hr.person.civil.update', personId, actor.personId ?? null, changes, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** ข้อมูลการศึกษา (ก.พ.7): the person themself or HR replaces the whole list, kept in the order given. */
  async updateEducation(personId: string, input: UpdateEducationInput, actor: AccessSubject): Promise<UpdateEducationResult> {
    const valid = updateEducationInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateEducationResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editContact) return { ok: false, code: 'FORBIDDEN' };
      const current = await database.query<EducationEntryView>("SELECT DATE_FORMAT(graduated_on, '%Y-%m-%d') AS graduatedOn, degree, major, institution, country FROM hr_person_education WHERE person_id = ? ORDER BY sequence", [personId]);
      const next = valid.entries.map((entry) => ({ graduatedOn: entry.graduatedOn ?? null, degree: entry.degree, major: entry.major ?? null, institution: entry.institution ?? null, country: entry.country ?? null }));
      if (JSON.stringify(current) === JSON.stringify(next)) return { ok: true };
      await database.execute('DELETE FROM hr_person_education WHERE person_id = ?', [personId]);
      for (const [index, entry] of next.entries()) {
        await database.execute('INSERT INTO hr_person_education (id, person_id, sequence, graduated_on, degree, major, institution, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
          [this.createId(), personId, index + 1, entry.graduatedOn, entry.degree, entry.major, entry.institution, entry.country]);
      }
      await recordProfileAudit(database, 'hr.person.education.update', personId, actor.personId ?? null, { changedFields: ['education'], workChanges: {} }, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** ตำแหน่งและอัตราเงินเดือน (ก.พ.7): only HR replaces the whole list; rows are kept in date order. */
  async updatePositionHistory(personId: string, input: UpdatePositionHistoryInput, actor: AccessSubject): Promise<UpdateEducationResult> {
    const valid = updatePositionHistoryInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateEducationResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editProfile) return { ok: false, code: 'FORBIDDEN' };
      const next: PositionHistoryView[] = valid.entries
        .map((entry) => ({ effectiveOn: entry.effectiveOn, description: entry.description, positionNumber: entry.positionNumber ?? null, positionType: entry.positionType ?? null, level: entry.level ?? null, salary: entry.salary ?? null, positionAllowance: entry.positionAllowance ?? null, reference: entry.reference ?? null }))
        .map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.effectiveOn.localeCompare(b.entry.effectiveOn) || a.index - b.index).map(({ entry }) => entry);
      const current = await readPositionHistory(database, personId);
      if (JSON.stringify(current) === JSON.stringify(next)) return { ok: true };
      await database.execute('DELETE FROM hr_person_position_history WHERE person_id = ?', [personId]);
      for (const [index, entry] of next.entries()) {
        await database.execute('INSERT INTO hr_person_position_history (id, person_id, sequence, effective_on, description, position_number, position_type, level, salary, position_allowance, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
          [this.createId(), personId, index + 1, entry.effectiveOn, entry.description, entry.positionNumber, entry.positionType, entry.level, entry.salary, entry.positionAllowance, entry.reference]);
      }
      await recordProfileAudit(database, 'hr.person.position-history.update', personId, actor.personId ?? null, { changedFields: ['positionHistory'], workChanges: {} }, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** Whether the actor may change this person's ก.พ.7 file; checked before an upload is stored. */
  async canEditKp7(personId: string, actor: AccessSubject): Promise<boolean> {
    const [person] = await this.database.query<{ organizationId: string | null }>(
      'SELECT (SELECT a.organization_id FROM employment_assignment a WHERE a.person_id = p.id AND a.effective_until IS NULL ORDER BY a.effective_from DESC LIMIT 1) AS organizationId FROM person p WHERE p.id = ?', [personId]);
    return person !== undefined && profileAccess(actor, { personId, organizationId: person.organizationId }).editContact;
  }

  /** Sets (or with null removes) the person's ก.พ.7 file: a PDF the actor uploaded themself. The person and HR may. */
  async setKp7File(personId: string, attachmentId: string | null, actor: AccessSubject): Promise<SetKp7FileResult> {
    return this.database.transaction(async (database): Promise<SetKp7FileResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (!profileAccess(actor, subject).editContact) return { ok: false, code: 'FORBIDDEN' };
      if (attachmentId !== null) {
        const [file] = await database.query<{ contentType: string; sizeBytes: string; createdBy: string }>('SELECT content_type AS contentType, size_bytes AS sizeBytes, created_by_person_id AS createdBy FROM attachment WHERE id = ?', [attachmentId]);
        if (!file || file.createdBy !== actor.personId || file.contentType !== 'application/pdf' || Number(file.sizeBytes) > MAX_KP7_FILE_BYTES) return { ok: false, code: 'INVALID_FILE' };
        // A file already attached to a ใบลา, a trip or another ก.พ.7 must not gain a second set of readers.
        const [{ used }] = await database.query<{ used: number }>(`SELECT (EXISTS (SELECT 1 FROM leave_request WHERE attachment_id = ?) OR EXISTS (SELECT 1 FROM official_travel WHERE attachment_id = ?)
          OR EXISTS (SELECT 1 FROM hr_person_profile WHERE kp7_attachment_id = ? AND person_id <> ?)) AS used`, [attachmentId, attachmentId, attachmentId, personId]) as [{ used: number }];
        if (Number(used)) return { ok: false, code: 'INVALID_FILE' };
      }
      const [current] = await database.query<{ file: string | null }>('SELECT kp7_attachment_id AS file FROM hr_person_profile WHERE person_id = ?', [personId]);
      if ((current?.file ?? null) === attachmentId) return { ok: true };
      await database.execute(`INSERT INTO hr_person_profile (person_id, kp7_attachment_id, updated_at) VALUES (?, ?, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE kp7_attachment_id = VALUES(kp7_attachment_id), updated_at = VALUES(updated_at)`, [personId, attachmentId]);
      await recordProfileAudit(database, 'hr.person.kp7.update', personId, actor.personId ?? null, { changedFields: ['kp7File'], workChanges: {} }, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** Sets (or with null removes) the person's own photo: an image they uploaded themself, of an allowed type and size. */
  async setOwnPhoto(personId: string, attachmentId: string | null, actor: AccessSubject): Promise<SetPhotoResult> {
    if (!isSelf(actor, personId)) return { ok: false, code: 'FORBIDDEN' };
    return this.database.transaction(async (database): Promise<SetPhotoResult> => {
      const subject = await lockProfileSubject(database, personId);
      if (!subject) return { ok: false, code: 'NOT_FOUND' };
      if (attachmentId !== null) {
        const [file] = await database.query<{ contentType: string; sizeBytes: string; createdBy: string }>('SELECT content_type AS contentType, size_bytes AS sizeBytes, created_by_person_id AS createdBy FROM attachment WHERE id = ?', [attachmentId]);
        if (!file || file.createdBy !== personId || !profilePhotoContentTypeSchema.safeParse(file.contentType).success || Number(file.sizeBytes) > MAX_PROFILE_PHOTO_BYTES) return { ok: false, code: 'INVALID_PHOTO' };
      }
      const [current] = await database.query<{ photo: string | null }>('SELECT photo_attachment_id AS photo FROM hr_person_profile WHERE person_id = ?', [personId]);
      if ((current?.photo ?? null) === attachmentId) return { ok: true };
      await database.execute(`INSERT INTO hr_person_profile (person_id, photo_attachment_id, updated_at) VALUES (?, ?, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE photo_attachment_id = VALUES(photo_attachment_id), updated_at = VALUES(updated_at)`, [personId, attachmentId]);
      await recordProfileAudit(database, 'hr.person.photo.update', personId, personId, { changedFields: ['photo'], workChanges: {} }, this.createId);
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  async photoAttachmentOf(personId: string): Promise<string | null> {
    const [row] = await this.database.query<{ photo: string | null }>('SELECT photo_attachment_id AS photo FROM hr_person_profile WHERE person_id = ?', [personId]);
    return row?.photo ?? null;
  }
}

/**
 * Writes personal and work fields for a person whose row the caller already locked, with one audit event.
 * Access is the caller's job; the master data import calls this inside its own transaction.
 */
export async function applyProfileUpdate(database: QueryDatabase, subject: ProfileSubject, valid: UpdatePersonProfileInput, actorPersonId: string, createId: () => string, options: { canEditOrganization: (organizationId: string) => boolean; syncDisplayName: boolean; auditAction?: string; checkPosition?: boolean; extraChangedFields?: readonly string[] }): Promise<UpdateProfileResult> {
  const stored = await readStoredProfile(database, subject.personId);
  const position = await resolvePosition(database, subject, stored, valid, options.checkPosition ?? false);
  if (typeof position === 'string') return { ok: false, code: position };
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
  if (valid.organizationId === null) organizationName = null;
  else if (valid.organizationId !== undefined && valid.organizationId !== subject.organizationId) {
    const [target] = await database.query<{ name: string }>('SELECT name FROM organization WHERE id = ? AND deleted_at IS NULL', [valid.organizationId]);
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
  // Two units can share a name (งาน under different กลุ่มงาน), so a move is decided by id, not by the name diff.
  const moved = valid.organizationId !== undefined && valid.organizationId !== subject.organizationId;
  if (moved && !changes.changedFields.includes('organization')) changes.changedFields.push('organization');
  if (changes.changedFields.length === 0) return { ok: true };
  const merged: StoredProfile = { ...stored, ...defined(pick(valid, ['namePrefix', 'firstName', 'lastName', 'birthDate', 'employmentTypeId', 'appointedOn', 'positionLevel'])), gender, positionId: position.positionId };
  await writeProfile(database, subject.personId, merged);
  if (options.syncDisplayName && ['namePrefix', 'firstName', 'lastName'].some((field) => changes.changedFields.includes(field)) && (merged.firstName || merged.lastName)) {
    await database.execute('UPDATE person SET display_name = ? WHERE id = ?', [`${merged.namePrefix ?? ''}${merged.firstName ?? ''} ${merged.lastName ?? ''}`.trim(), subject.personId]);
  }
  if (changes.changedFields.includes('positionTitle')) await database.execute('UPDATE person SET position_title = ? WHERE id = ?', [valid.positionTitle ?? null, subject.personId]);
  if (moved && valid.organizationId) await moveAssignment(database, subject, valid.organizationId, createId);
  // No unit (ไม่มีสังกัด): the open assignment is closed and none replaces it.
  if (moved && valid.organizationId === null) await database.execute('UPDATE employment_assignment SET effective_until = UTC_TIMESTAMP() WHERE person_id = ? AND effective_until IS NULL', [subject.personId]);
  changes.changedFields.push(...(options.extraChangedFields ?? []).filter((field) => !changes.changedFields.includes(field)));
  await recordProfileAudit(database, options.auditAction ?? 'hr.person.profile.update', subject.personId, actorPersonId, changes, createId);
  return { ok: true };
}

/**
 * Links the position title to the catalogue and checks the level against it (ก.พ. structure).
 * Only a changed title or level is checked, so a person still on an older free-text title can be saved untouched.
 * HR's form is strict; the master data import links a title it finds and keeps any other as free text.
 */
async function resolvePosition(database: QueryDatabase, subject: ProfileSubject, stored: StoredProfile, valid: UpdatePersonProfileInput, strict: boolean): Promise<{ positionId: string | null } | 'UNKNOWN_POSITION' | 'INACTIVE_POSITION' | 'LEVEL_NOT_ALLOWED'> {
  const titleChanged = valid.positionTitle !== undefined && valid.positionTitle !== subject.positionTitle;
  const levelChanged = valid.positionLevel !== undefined && valid.positionLevel !== stored.positionLevel;
  let positionId = stored.positionId;
  // A person never linked (older data) is linked through the title they already hold, so a level-only change is checked too.
  if (!titleChanged && positionId === null && subject.positionTitle) {
    const [found] = await database.query<{ id: string }>('SELECT id FROM hr_position WHERE name = ? LOCK IN SHARE MODE', [subject.positionTitle]);
    positionId = found?.id ?? null;
  }
  if (titleChanged) {
    if (valid.positionTitle === null) positionId = null;
    else {
      // A shared lock keeps the position from being renamed or deleted until this save commits.
      const [found] = await database.query<{ id: string; isActive: number }>('SELECT id, is_active AS isActive FROM hr_position WHERE name = ? LOCK IN SHARE MODE', [valid.positionTitle]);
      if (!found && strict) return 'UNKNOWN_POSITION';
      if (found && !found.isActive && strict) return 'INACTIVE_POSITION';
      positionId = found?.id ?? null;
    }
  }
  if (strict && (titleChanged || levelChanged) && positionId) {
    const [held] = await database.query<{ allowedLevels: string | string[] }>('SELECT allowed_levels AS allowedLevels FROM hr_position WHERE id = ? LOCK IN SHARE MODE', [positionId]);
    const level = valid.positionLevel !== undefined ? valid.positionLevel : stored.positionLevel;
    if (held && !levelAllowed(levelsOf(held.allowedLevels), level ?? null)) return 'LEVEL_NOT_ALLOWED';
  }
  return { positionId };
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

async function readStoredProfile(database: Pick<Database, 'query'>, personId: string): Promise<StoredProfile> {
  const select = (Object.entries(profileColumns) as [ProfileColumn, string][])
    .map(([field, column]) => dateColumns.has(column) ? `DATE_FORMAT(${column}, '%Y-%m-%d') AS ${field}` : `${column} AS ${field}`).join(', ');
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

async function readPositionHistory(database: Pick<Database, 'query'>, personId: string): Promise<PositionHistoryView[]> {
  const rows = await database.query<Omit<PositionHistoryView, 'salary' | 'positionAllowance'> & { salary: string | number | null; positionAllowance: string | number | null }>(
    `SELECT DATE_FORMAT(effective_on, '%Y-%m-%d') AS effectiveOn, description, position_number AS positionNumber, position_type AS positionType, level, salary, position_allowance AS positionAllowance, reference
     FROM hr_person_position_history WHERE person_id = ? ORDER BY sequence`, [personId]);
  return rows.map((row) => ({ ...row, salary: row.salary === null ? null : Number(row.salary), positionAllowance: row.positionAllowance === null ? null : Number(row.positionAllowance) }));
}
