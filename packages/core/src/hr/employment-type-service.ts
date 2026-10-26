import { randomUUID } from 'node:crypto';
import { employmentTypeInputSchema, type EmploymentType, type EmploymentTypeInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

type DuplicateCode = 'DUPLICATE_CODE' | 'DUPLICATE_NAME';
const fields = ['code', 'name', 'isActive', 'sortOrder'] as const;

/** The list HR keeps of employment types. Types are never deleted, so people on a retired type keep its name. */
export class EmploymentTypeService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly createId: () => string = randomUUID) {}

  async list(options: { activeOnly?: boolean } = {}): Promise<EmploymentType[]> {
    const rows = await this.database.query<Omit<EmploymentType, 'isActive' | 'sortOrder'> & { isActive: number; sortOrder: number | string }>(
      `SELECT id, code, name, is_active AS isActive, sort_order AS sortOrder FROM hr_employment_type ${options.activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order, name`
    );
    return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive), sortOrder: Number(row.sortOrder) }));
  }

  async create(input: EmploymentTypeInput, actorPersonId: string): Promise<{ ok: true; id: string } | { ok: false; code: DuplicateCode }> {
    const valid = employmentTypeInputSchema.parse(input);
    const id = this.createId();
    return withDuplicateCheck(() => this.database.transaction(async (database) => {
      await database.execute('INSERT INTO hr_employment_type (id, code, name, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [id, valid.code, valid.name, valid.isActive ? 1 : 0, valid.sortOrder]);
      await this.audit(database, 'hr.employment_type.create', id, actorPersonId, [...fields]);
      return { ok: true as const, id };
    }));
  }

  async update(id: string, input: EmploymentTypeInput, actorPersonId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | DuplicateCode }> {
    const valid = employmentTypeInputSchema.parse(input);
    return withDuplicateCheck(() => this.database.transaction(async (database) => {
      const [stored] = await database.query<{ code: string; name: string; isActive: number; sortOrder: number | string }>('SELECT code, name, is_active AS isActive, sort_order AS sortOrder FROM hr_employment_type WHERE id = ? FOR UPDATE', [id]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      const before: EmploymentTypeInput = { code: stored.code, name: stored.name, isActive: Boolean(stored.isActive), sortOrder: Number(stored.sortOrder) };
      const changedFields = fields.filter((field) => before[field] !== valid[field]);
      if (changedFields.length === 0) return { ok: true as const };
      await database.execute('UPDATE hr_employment_type SET code = ?, name = ?, is_active = ?, sort_order = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [valid.code, valid.name, valid.isActive ? 1 : 0, valid.sortOrder, id]);
      await this.audit(database, 'hr.employment_type.update', id, actorPersonId, changedFields);
      return { ok: true as const };
    }));
  }

  private audit(database: Pick<Database, 'execute'>, action: string, id: string, actorPersonId: string, changedFields: string[]): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType: 'employment_type', targetId: id, result: 'SUCCESS', metadata: { changedFields } });
  }
}

async function withDuplicateCheck<T>(work: () => Promise<T>): Promise<T | { ok: false; code: DuplicateCode }> {
  try {
    return await work();
  } catch (error) {
    if (error && typeof error === 'object' && 'errno' in error && error.errno === 1062) {
      return { ok: false, code: String((error as { message?: unknown }).message).includes('hr_employment_type_name_unique') ? 'DUPLICATE_NAME' : 'DUPLICATE_CODE' };
    }
    throw error;
  }
}
