import { randomUUID } from 'node:crypto';
import { createOrganizationUnitInputSchema, updateOrganizationUnitInputSchema, type CreateOrganizationUnitInput, type UpdateOrganizationUnitInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

type QueryDatabase = Pick<Database, 'execute' | 'query'>;
type StructureCode = 'ORGANIZATION_NOT_FOUND' | 'DUPLICATE_NAME' | 'PARENT_NOT_DIVISION';
export type CreateUnitResult = { ok: true; id: string } | { ok: false; code: StructureCode };
export type UpdateUnitResult = { ok: true } | { ok: false; code: StructureCode };
export type DeleteUnitResult = { ok: true; units: number; people: number } | { ok: false; code: 'ORGANIZATION_NOT_FOUND' };
interface Unit { id: string; name: string; parentId: string | null; unitType: string | null }

/** Adds, renames, moves and deletes กลุ่มงาน and งาน. Deleting keeps the row for history and leaves its people with no unit. */
export class OrganizationStructureService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly createId: () => string = randomUUID) {}

  async create(input: CreateOrganizationUnitInput, actorPersonId: string): Promise<CreateUnitResult> {
    const valid = createOrganizationUnitInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<CreateUnitResult> => {
      let parentId: string | null;
      if (valid.unitType === 'SECTION') {
        const parent = valid.parentId ? await lockUnit(database, valid.parentId) : null;
        if (parent?.unitType !== 'DIVISION') return { ok: false, code: 'PARENT_NOT_DIVISION' };
        parentId = parent.id;
      } else {
        // A กลุ่มงาน hangs under the hospital when exactly one hospital unit exists.
        const hospitals = await database.query<{ id: string }>("SELECT id FROM organization WHERE unit_type = 'HOSPITAL' AND deleted_at IS NULL LIMIT 2");
        parentId = hospitals.length === 1 ? hospitals[0]!.id : null;
      }
      if (await nameTaken(database, valid.name, valid.unitType, parentId, null)) return { ok: false, code: 'DUPLICATE_NAME' };
      const id = this.createId();
      await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, valid.name, parentId, valid.unitType]);
      await this.audit(database, actorPersonId, 'hr.organization.create', id, { organizationId: id, unitType: valid.unitType, parentId });
      return { ok: true, id };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  async update(id: string, input: UpdateOrganizationUnitInput, actorPersonId: string): Promise<UpdateUnitResult> {
    const valid = updateOrganizationUnitInputSchema.parse(input);
    return this.database.transaction(async (database): Promise<UpdateUnitResult> => {
      const unit = await lockUnit(database, id);
      if (!unit) return { ok: false, code: 'ORGANIZATION_NOT_FOUND' };
      let parentId = unit.parentId;
      if (valid.parentId !== undefined && valid.parentId !== unit.parentId) {
        const parent = unit.unitType === 'SECTION' ? await lockUnit(database, valid.parentId) : null;
        if (parent?.unitType !== 'DIVISION') return { ok: false, code: 'PARENT_NOT_DIVISION' };
        parentId = parent.id;
      }
      if (await nameTaken(database, valid.name, unit.unitType, parentId, unit.id)) return { ok: false, code: 'DUPLICATE_NAME' };
      if (valid.name === unit.name && parentId === unit.parentId) return { ok: true };
      await database.execute('UPDATE organization SET name = ?, parent_id = ? WHERE id = ?', [valid.name, parentId, unit.id]);
      await this.audit(database, actorPersonId, 'hr.organization.update', unit.id, { organizationId: unit.id, parentId });
      return { ok: true };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** How many units (the unit and everything under it) and people a delete would affect. */
  async deletionImpact(id: string): Promise<{ units: number; people: number } | null> {
    const ids = await subtree(this.database, id);
    if (ids.length === 0) return null;
    return { units: ids.length, people: await peopleIn(this.database, ids) };
  }

  async delete(id: string, actorPersonId: string): Promise<DeleteUnitResult> {
    return this.database.transaction(async (database): Promise<DeleteUnitResult> => {
      // Units are locked before assignments, the same order a profile save uses, so the two cannot deadlock.
      const ids = await subtree(database, id, true);
      if (ids.length === 0) return { ok: false, code: 'ORGANIZATION_NOT_FOUND' };
      const marks = ids.map(() => '?').join(', ');
      const people = await peopleIn(database, ids);
      await database.execute(`UPDATE employment_assignment SET effective_until = UTC_TIMESTAMP() WHERE effective_until IS NULL AND organization_id IN (${marks})`, ids);
      await database.execute(`UPDATE hr_organization_head SET effective_until = GREATEST(effective_from, UTC_TIMESTAMP()) WHERE (effective_until IS NULL OR effective_until > UTC_TIMESTAMP()) AND organization_id IN (${marks})`, ids);
      // The code is cleared so a later unit, or a master data import, can use it again.
      await database.execute(`UPDATE organization SET deleted_at = UTC_TIMESTAMP(), code = NULL WHERE id IN (${marks})`, ids);
      await this.audit(database, actorPersonId, 'hr.organization.delete', id, { organizationId: id, units: ids.length, people });
      for (const childId of ids.slice(1)) await this.audit(database, actorPersonId, 'hr.organization.delete', childId, { organizationId: childId, parentId: id });
      return { ok: true, units: ids.length, people };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  private audit(database: QueryDatabase, actorPersonId: string, action: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType: 'organization', targetId, result: 'SUCCESS', metadata });
  }
}

async function lockUnit(database: QueryDatabase, id: string): Promise<Unit | null> {
  const [unit] = await database.query<Unit>('SELECT id, name, parent_id AS parentId, unit_type AS unitType FROM organization WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
  return unit ?? null;
}

async function nameTaken(database: QueryDatabase, name: string, unitType: string | null, parentId: string | null, exceptId: string | null): Promise<boolean> {
  // กลุ่มงาน names are unique hospital-wide; other units only among their siblings.
  const scope = unitType === 'DIVISION' ? "unit_type = 'DIVISION'" : parentId ? 'parent_id = ?' : 'parent_id IS NULL';
  const rows = await database.query<{ id: string }>(`SELECT id FROM organization WHERE deleted_at IS NULL AND name = ? AND ${scope} AND id <> ?`, [name, ...(unitType !== 'DIVISION' && parentId ? [parentId] : []), exceptId ?? '']);
  return rows.length > 0;
}

/** The unit and every live unit under it, the unit first. */
async function subtree(database: Pick<Database, 'query'>, id: string, lock = false): Promise<string[]> {
  const suffix = lock ? ' FOR UPDATE' : '';
  const root = await database.query<{ id: string }>(`SELECT id FROM organization WHERE id = ? AND deleted_at IS NULL${suffix}`, [id]);
  if (root.length === 0) return [];
  const ids = [id];
  for (let frontier = [id]; frontier.length > 0;) {
    const children = await database.query<{ id: string }>(`SELECT id FROM organization WHERE deleted_at IS NULL AND parent_id IN (${frontier.map(() => '?').join(', ')})${suffix}`, frontier);
    frontier = children.map((child) => child.id).filter((child) => !ids.includes(child));
    ids.push(...frontier);
  }
  return ids;
}

async function peopleIn(database: Pick<Database, 'query'>, ids: string[]): Promise<number> {
  const [row] = await database.query<{ people: number | string }>(`SELECT COUNT(DISTINCT person_id) AS people FROM employment_assignment WHERE effective_until IS NULL AND organization_id IN (${ids.map(() => '?').join(', ')})`, ids);
  return Number(row?.people ?? 0);
}
