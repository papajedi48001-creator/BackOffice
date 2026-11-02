import { randomUUID } from 'node:crypto';
import {
  changeOwnPasswordInputSchema, createPersonWithAccountInputSchema, DEFAULT_RESET_PASSWORD, localAccountInputSchema, updatePersonIdentityInputSchema,
  type AccessSubject, type ChangeOwnPasswordInput, type CreatePersonWithAccountInput, type LocalAccountInput, type UpdatePersonIdentityInput
} from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { NationalIdProtector } from '../crypto/national-id';
import { isAdmin } from '../access/authorization-service';
import { hashPassword, verifyPassword } from '../identity/auth-service';
import { canManagePeople } from './profile-access';
import { applyProfileUpdate, lockProfileSubject, type UpdateProfileResult } from './profile-service';

type QueryDatabase = Pick<Database, 'query' | 'execute'>;
type DuplicateCode = 'DUPLICATE_NATIONAL_ID' | 'DUPLICATE_EMPLOYEE_CODE' | 'DUPLICATE_USERNAME';
type ProfileCode = Extract<UpdateProfileResult, { ok: false }>['code'];
export type CreatePersonResult = { ok: true; id: string } | { ok: false; code: DuplicateCode | ProfileCode };
export type IdentityResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | DuplicateCode };
export type ChangeOwnPasswordResult = { ok: true } | { ok: false; code: 'NO_ACCOUNT' | 'WRONG_PASSWORD' | 'SAME_PASSWORD' };
export type PasswordResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'NO_ACCOUNT' | 'PROTECTED_ACCOUNT' };
export type CreateAccountResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'FORBIDDEN' | 'ACCOUNT_EXISTS' | 'DUPLICATE_USERNAME' };

/** Thrown inside a transaction to roll it back and answer with a code. */
class Refused extends Error { constructor(readonly code: string) { super(code); } }

/**
 * Creates a บุคลากร with their profile and บัญชีท้องถิ่น, and edits identity fields (employee code, status, national ID)
 * and the password. A username never changes once saved. Only a hospital-wide HR manager may do any of this.
 * National IDs and passwords never reach an audit event.
 */
export class PersonAccountService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly protector: NationalIdProtector, private readonly createId: () => string = randomUUID) {}

  async create(input: CreatePersonWithAccountInput, actor: AccessSubject): Promise<CreatePersonResult> {
    const { nationalId, employeeCode, username, password, phone, ...profile } = createPersonWithAccountInputSchema.parse(input);
    if (!canManagePeople(actor)) return { ok: false, code: 'FORBIDDEN' };
    const passwordHash = await hashPassword(password);
    const id = this.createId();
    return refusals(() => this.database.transaction(async (database): Promise<CreatePersonResult> => {
      const duplicate = await findDuplicate(database, { lookup: this.protector.lookup(nationalId), employeeCode: employeeCode ?? null, username });
      if (duplicate) return { ok: false, code: duplicate };
      await database.execute(
        "INSERT INTO person (id, employee_code, national_id_ciphertext, national_id_lookup, national_id_masked, employment_status, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', UTC_TIMESTAMP())",
        [id, employeeCode ?? null, this.protector.encrypt(nationalId), this.protector.lookup(nationalId), this.protector.mask(nationalId)]);
      const subject = await lockProfileSubject(database, id);
      // The profile save writes the one audit event, as hr.person.create; it names fields, never their values.
      const saved = await applyProfileUpdate(database, subject!, profile, actor.personId!, this.createId, { canEditOrganization: () => true, syncDisplayName: true, checkPosition: true, auditAction: 'hr.person.create', extraChangedFields: phone ? ['phone'] : [] });
      if (!saved.ok) throw new Refused(saved.code);
      if (phone) await database.execute('UPDATE hr_person_profile SET phone = ? WHERE person_id = ?', [phone, id]);
      await database.execute('INSERT INTO local_account (id, person_id, username, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, UTC_TIMESTAMP())', [this.createId(), id, username, passwordHash]);
      return { ok: true, id };
    }, { isolationLevel: 'READ COMMITTED' })) as Promise<CreatePersonResult>;
  }

  async getAccount(personId: string): Promise<{ username: string } | null> {
    return localAccountOf(this.database, personId);
  }

  async updateIdentity(personId: string, input: UpdatePersonIdentityInput, actor: AccessSubject): Promise<IdentityResult> {
    const valid = updatePersonIdentityInputSchema.parse(input);
    if (!canManagePeople(actor)) return { ok: false, code: 'FORBIDDEN' };
    return refusals(() => this.database.transaction(async (database): Promise<IdentityResult> => {
      const [stored] = await database.query<{ employeeCode: string | null; status: string; lookup: string }>('SELECT employee_code AS employeeCode, employment_status AS status, national_id_lookup AS lookup FROM person WHERE id = ? FOR UPDATE', [personId]);
      if (!stored) return { ok: false, code: 'NOT_FOUND' };
      const lookup = valid.nationalId ? this.protector.lookup(valid.nationalId) : stored.lookup;
      const changedFields = [
        ...(valid.employeeCode !== undefined && valid.employeeCode !== stored.employeeCode ? ['employeeCode'] : []),
        ...(valid.employmentStatus !== undefined && valid.employmentStatus !== stored.status ? ['employmentStatus'] : []),
        ...(lookup !== stored.lookup ? ['nationalId'] : [])
      ];
      if (changedFields.length === 0) return { ok: true };
      const duplicate = await findDuplicate(database, { lookup: changedFields.includes('nationalId') ? lookup : null, employeeCode: changedFields.includes('employeeCode') ? valid.employeeCode ?? null : null, username: null }, personId);
      if (duplicate) return { ok: false, code: duplicate };
      if (changedFields.includes('employeeCode')) await database.execute('UPDATE person SET employee_code = ? WHERE id = ?', [valid.employeeCode ?? null, personId]);
      if (changedFields.includes('employmentStatus')) await database.execute('UPDATE person SET employment_status = ? WHERE id = ?', [valid.employmentStatus!, personId]);
      // A person who has left (พ้นสภาพ) is signed out now; login refuses them until they are active again.
      if (changedFields.includes('employmentStatus') && valid.employmentStatus === 'INACTIVE') await database.execute('UPDATE user_session SET revoked_at = UTC_TIMESTAMP() WHERE person_id = ? AND revoked_at IS NULL', [personId]);
      if (changedFields.includes('nationalId')) await database.execute('UPDATE person SET national_id_ciphertext = ?, national_id_lookup = ?, national_id_masked = ? WHERE id = ?', [this.protector.encrypt(valid.nationalId!), lookup, this.protector.mask(valid.nationalId!), personId]);
      await this.audit(database, actor.personId!, 'hr.person.identity.update', 'person', personId, { changedFields });
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' })) as Promise<IdentityResult>;
  }

  /**
   * รีเซ็ตรหัสผ่าน: HR (hospital-wide) or a ผู้ดูแลระบบ puts the account back on DEFAULT_RESET_PASSWORD and the owner must choose a new
   * one at the next login. Nobody resets their own account; HR may not reset anyone holding a role in the system, a ผู้ดูแลระบบ may.
   */
  async resetPassword(personId: string, actor: AccessSubject): Promise<PasswordResult> {
    const admin = isAdmin(actor);
    if (!admin && !canManagePeople(actor)) return { ok: false, code: 'FORBIDDEN' };
    const passwordHash = await hashPassword(DEFAULT_RESET_PASSWORD);
    return this.database.transaction(async (database): Promise<PasswordResult> => {
      const [person] = await database.query<{ id: string }>('SELECT id FROM person WHERE id = ? FOR UPDATE', [personId]);
      if (!person) return { ok: false, code: 'NOT_FOUND' };
      if (personId === actor.personId) return { ok: false, code: 'PROTECTED_ACCOUNT' };
      if (!admin && (await database.query('SELECT id FROM role_assignment WHERE person_id = ? LIMIT 1', [personId])).length > 0) return { ok: false, code: 'PROTECTED_ACCOUNT' };
      const [account] = await database.query<{ id: string }>('SELECT id FROM local_account WHERE person_id = ? ORDER BY created_at LIMIT 1', [personId]);
      if (!account) return { ok: false, code: 'NO_ACCOUNT' };
      await database.execute('UPDATE local_account SET password_hash = ?, must_change_password = 1 WHERE id = ?', [passwordHash, account.id]);
      // Whoever was signed in with the old password is signed out.
      await database.execute('UPDATE user_session SET revoked_at = UTC_TIMESTAMP() WHERE person_id = ? AND revoked_at IS NULL', [personId]);
      await this.audit(database, actor.personId!, 'hr.person.password.reset', 'local_account', account.id, { personId });
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /**
   * เปลี่ยนรหัสผ่าน by the owner only. Right after a reset (must_change_password) the current password is not asked for; otherwise it
   * must match. The new one may not repeat the current or the default. Every session ends, so the person signs in again with it.
   */
  async changeOwnPassword(personId: string, input: ChangeOwnPasswordInput): Promise<ChangeOwnPasswordResult> {
    const valid = changeOwnPasswordInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<ChangeOwnPasswordResult> => {
      const [account] = await database.query<{ id: string; passwordHash: string; mustChange: number | string }>(
        'SELECT id, password_hash AS passwordHash, must_change_password AS mustChange FROM local_account WHERE person_id = ? ORDER BY created_at LIMIT 1 FOR UPDATE', [personId]);
      if (!account) return { ok: false, code: 'NO_ACCOUNT' };
      const forced = Number(account.mustChange) === 1;
      if (!forced && !(valid.currentPassword && await verifyPassword(valid.currentPassword, account.passwordHash))) return { ok: false, code: 'WRONG_PASSWORD' };
      if (valid.newPassword === DEFAULT_RESET_PASSWORD || await verifyPassword(valid.newPassword, account.passwordHash)) return { ok: false, code: 'SAME_PASSWORD' };
      await database.execute('UPDATE local_account SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await hashPassword(valid.newPassword), account.id]);
      await database.execute('UPDATE user_session SET revoked_at = UTC_TIMESTAMP() WHERE person_id = ? AND revoked_at IS NULL', [personId]);
      await this.audit(database, personId, 'identity.password.change', 'local_account', account.id, { forced });
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  async createAccount(personId: string, input: LocalAccountInput, actor: AccessSubject): Promise<CreateAccountResult> {
    const valid = localAccountInputSchema.parse(input);
    if (!canManagePeople(actor)) return { ok: false, code: 'FORBIDDEN' };
    const passwordHash = await hashPassword(valid.password);
    return refusals(() => this.database.transaction(async (database): Promise<CreateAccountResult> => {
      const [person] = await database.query<{ id: string }>('SELECT id FROM person WHERE id = ? FOR UPDATE', [personId]);
      if (!person) return { ok: false, code: 'NOT_FOUND' };
      if ((await database.query('SELECT id FROM local_account WHERE person_id = ?', [personId])).length > 0) return { ok: false, code: 'ACCOUNT_EXISTS' };
      if (await findDuplicate(database, { lookup: null, employeeCode: null, username: valid.username })) return { ok: false, code: 'DUPLICATE_USERNAME' };
      const accountId = this.createId();
      await database.execute('INSERT INTO local_account (id, person_id, username, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, UTC_TIMESTAMP())', [accountId, personId, valid.username, passwordHash]);
      await this.audit(database, actor.personId!, 'hr.person.account.create', 'local_account', accountId, { personId });
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' })) as Promise<CreateAccountResult>;
  }

  private audit(database: QueryDatabase, actorPersonId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}

/** The person's บัญชีท้องถิ่น username, or null. Reads nothing sensitive, so it needs no national ID key. */
export async function localAccountOf(database: Pick<Database, 'query'>, personId: string): Promise<{ username: string } | null> {
  const [account] = await database.query<{ username: string }>('SELECT username FROM local_account WHERE person_id = ? ORDER BY created_at LIMIT 1', [personId]);
  return account ?? null;
}

async function findDuplicate(database: QueryDatabase, values: { lookup: string | null; employeeCode: string | null; username: string | null }, exceptPersonId = ''): Promise<DuplicateCode | null> {
  if (values.lookup && (await database.query('SELECT id FROM person WHERE national_id_lookup = ? AND id <> ?', [values.lookup, exceptPersonId])).length > 0) return 'DUPLICATE_NATIONAL_ID';
  if (values.employeeCode && (await database.query('SELECT id FROM person WHERE employee_code = ? AND id <> ?', [values.employeeCode, exceptPersonId])).length > 0) return 'DUPLICATE_EMPLOYEE_CODE';
  if (values.username && (await database.query('SELECT id FROM local_account WHERE username = ?', [values.username])).length > 0) return 'DUPLICATE_USERNAME';
  return null;
}

/** Turns a rollback code, or a unique key that a concurrent save won, into an answer. */
async function refusals<T>(work: () => Promise<T>): Promise<T | { ok: false; code: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refused) return { ok: false, code: error.code };
    if (error && typeof error === 'object' && 'errno' in error && error.errno === 1062) {
      const message = String((error as { message?: unknown }).message);
      if (message.includes('local_account_username')) return { ok: false, code: 'DUPLICATE_USERNAME' };
      if (message.includes('employee_code')) return { ok: false, code: 'DUPLICATE_EMPLOYEE_CODE' };
      if (message.includes('national_id_lookup')) return { ok: false, code: 'DUPLICATE_NATIONAL_ID' };
    }
    throw error;
  }
}
