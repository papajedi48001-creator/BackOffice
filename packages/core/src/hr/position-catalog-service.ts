import { randomUUID } from 'node:crypto';
import { levelsFitCategory, positionCategorySchema, positionInputSchema, type Position, type PositionCategory, type PositionInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { parseCsvRecords } from './csv';

type QueryDatabase = Pick<Database, 'execute' | 'query'>;
export type PositionImportErrorCode = 'INVALID_CSV' | 'INVALID_HEADER' | 'NAME_REQUIRED' | 'UNKNOWN_CATEGORY' | 'LEVELS_NOT_IN_CATEGORY' | 'INVALID_ACTIVE' | 'DUPLICATE_ROW';
export type PositionImportResult = { ok: true; created: number; updated: number } | { ok: false; errors: { line: number; code: PositionImportErrorCode }[] };

const categoryNames: Record<string, PositionCategory> = { ทั่วไป: 'GENERAL', วิชาการ: 'ACADEMIC', อำนวยการ: 'DIRECTOR', บริหาร: 'EXECUTIVE', ไม่มีระดับ: 'NONE' };
const activeValues: Record<string, boolean> = { '': true, '1': true, true: true, ใช้งาน: true, เปิด: true, '0': false, false: false, ปิด: false, ปิดใช้งาน: false };
const csvHeader = ['name', 'category', 'levels', 'active'];

/** ตำแหน่งงาน and the ก.พ. levels each allows. A position is deleted only when nobody holds it; otherwise HR closes it. */
export class PositionCatalogService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly createId: () => string = randomUUID) {}

  async list(options: { activeOnly?: boolean } = {}): Promise<Position[]> {
    const rows = await this.database.query<{ id: string; name: string; category: PositionCategory; allowedLevels: string | string[]; isActive: number; sortOrder: number | string; holders: number | string }>(
      `SELECT pos.id, pos.name, pos.category, pos.allowed_levels AS allowedLevels, pos.is_active AS isActive, pos.sort_order AS sortOrder, (${holdersSql}) AS holders
       FROM hr_position pos ${options.activeOnly ? 'WHERE pos.is_active = 1' : ''} ORDER BY pos.sort_order, pos.name`);
    return rows.map((row) => ({ ...row, allowedLevels: levelsOf(row.allowedLevels), isActive: Boolean(row.isActive), sortOrder: Number(row.sortOrder), holders: Number(row.holders) }));
  }

  async create(input: PositionInput, actorPersonId: string): Promise<{ ok: true; id: string } | { ok: false; code: 'DUPLICATE_NAME' }> {
    const valid = positionInputSchema.parse(input);
    const id = this.createId();
    return withDuplicateName(() => this.database.transaction(async (database) => {
      await insertPosition(database, id, valid);
      await this.audit(database, actorPersonId, 'hr.position.create', id, { positionId: id });
      return { ok: true as const, id };
    }));
  }

  async update(id: string, input: PositionInput, actorPersonId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_NAME' }> {
    const valid = positionInputSchema.parse(input);
    return withDuplicateName(() => this.database.transaction(async (database) => {
      const [stored] = await database.query<{ name: string }>('SELECT name FROM hr_position WHERE id = ? FOR UPDATE', [id]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      // People whose title names the position but who were never linked follow a rename too.
      if (stored.name !== valid.name) await linkPositionsByTitle(database, (await database.query<{ id: string }>('SELECT id FROM person WHERE position_title = ?', [stored.name])).map((row) => row.id));
      await database.execute('UPDATE hr_position SET name = ?, category = ?, allowed_levels = ?, is_active = ?, sort_order = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [valid.name, valid.category, JSON.stringify(valid.allowedLevels), valid.isActive ? 1 : 0, valid.sortOrder, id]);
      // person.position_title is what other modules show, so it follows the catalogue name.
      if (stored.name !== valid.name) await database.execute('UPDATE person p JOIN hr_person_profile pr ON pr.person_id = p.id SET p.position_title = ? WHERE pr.position_id = ?', [valid.name, id]);
      await this.audit(database, actorPersonId, 'hr.position.update', id, { positionId: id });
      return { ok: true as const };
    }));
  }

  async delete(id: string, actorPersonId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'POSITION_IN_USE' }> {
    return this.database.transaction(async (database) => {
      const [stored] = await database.query<{ id: string }>('SELECT id FROM hr_position WHERE id = ? FOR UPDATE', [id]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      const [held] = await database.query<{ holders: number | string }>(`SELECT (${holdersSql}) AS holders FROM hr_position pos WHERE pos.id = ?`, [id]);
      if (Number(held?.holders ?? 0) > 0) return { ok: false as const, code: 'POSITION_IN_USE' as const };
      await database.execute('DELETE FROM hr_position WHERE id = ?', [id]);
      await this.audit(database, actorPersonId, 'hr.position.delete', id, { positionId: id });
      return { ok: true as const };
    }, { isolationLevel: 'READ COMMITTED' });
  }

  /** Adds or updates positions by name from `name,category,levels,active`; levels are separated by `|`. Never deletes. All rows or none. */
  async importCsv(text: string, actorPersonId: string): Promise<PositionImportResult> {
    let records;
    try { records = parseCsvRecords(text); } catch { return { ok: false, errors: [{ line: 1, code: 'INVALID_CSV' }] }; }
    const [header, ...rows] = records;
    if (!header || header.cells.map((cell) => cell.trim().toLowerCase()).join(',') !== csvHeader.join(',')) return { ok: false, errors: [{ line: header?.line ?? 1, code: 'INVALID_HEADER' }] };
    const errors: { line: number; code: PositionImportErrorCode }[] = [];
    const parsed: { name: string; category: PositionCategory; allowedLevels: string[]; isActive: boolean }[] = [];
    const seen = new Set<string>();
    for (const { line, cells } of rows) {
      const [name = '', categoryText = '', levelsText = '', activeText = ''] = cells.map((cell) => cell.trim());
      const category = categoryNames[categoryText] ?? positionCategorySchema.safeParse(categoryText.toUpperCase()).data;
      const allowedLevels = levelsText.split('|').map((level) => level.trim()).filter(Boolean);
      const isActive = activeValues[activeText.toLowerCase()];
      const code: PositionImportErrorCode | null = name === '' || name.length > 255 ? 'NAME_REQUIRED' : !category ? 'UNKNOWN_CATEGORY' : !levelsFitCategory(category, allowedLevels) ? 'LEVELS_NOT_IN_CATEGORY' : isActive === undefined ? 'INVALID_ACTIVE' : seen.has(name.toLowerCase()) ? 'DUPLICATE_ROW' : null;
      if (code) { errors.push({ line, code }); continue; }
      seen.add(name.toLowerCase());
      parsed.push({ name, category: category!, allowedLevels, isActive: isActive! });
    }
    if (errors.length > 0) return { ok: false, errors };
    return this.database.transaction(async (database): Promise<PositionImportResult> => {
      // Names compare without letter case, as the unique key does.
      const existing = new Map((await database.query<{ id: string; name: string }>('SELECT id, name FROM hr_position FOR UPDATE')).map((row) => [row.name.toLowerCase(), row.id]));
      const [last] = await database.query<{ sortOrder: number | string | null }>('SELECT MAX(sort_order) AS sortOrder FROM hr_position');
      let sortOrder = Number(last?.sortOrder ?? 0);
      let created = 0;
      for (const row of parsed) {
        const id = existing.get(row.name.toLowerCase());
        if (id) await database.execute('UPDATE hr_position SET category = ?, allowed_levels = ?, is_active = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [row.category, JSON.stringify(row.allowedLevels), row.isActive ? 1 : 0, id]);
        else { sortOrder = Math.min(sortOrder + 10, 9999); await insertPosition(database, this.createId(), { ...row, sortOrder }); created += 1; }
      }
      await this.audit(database, actorPersonId, 'hr.position.import', 'hr_position', { created, updated: parsed.length - created });
      return { ok: true, created, updated: parsed.length - created };
    });
  }

  private audit(database: QueryDatabase, actorPersonId: string, action: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType: 'position', targetId, result: 'SUCCESS', metadata });
  }
}

/** Holders are people linked to the position, or whose title names it but who were never linked (older data). */
const holdersSql = 'SELECT COUNT(*) FROM person p LEFT JOIN hr_person_profile pr ON pr.person_id = p.id WHERE pr.position_id = pos.id OR p.position_title = pos.name';

/** Links each person to the catalogue position their title names, or unlinks them when it names none. */
export async function linkPositionsByTitle(database: QueryDatabase, personIds: string[]): Promise<void> {
  if (personIds.length === 0) return;
  const marks = personIds.map(() => '?').join(', ');
  await database.execute(`INSERT IGNORE INTO hr_person_profile (person_id, updated_at) SELECT p.id, UTC_TIMESTAMP() FROM person p JOIN hr_position pos ON pos.name = p.position_title WHERE p.id IN (${marks})`, personIds);
  await database.execute(`UPDATE hr_person_profile pr JOIN person p ON p.id = pr.person_id LEFT JOIN hr_position pos ON pos.name = p.position_title SET pr.position_id = pos.id WHERE pr.person_id IN (${marks})`, personIds);
}

function insertPosition(database: QueryDatabase, id: string, position: PositionInput): Promise<void> {
  return database.execute('INSERT INTO hr_position (id, name, category, allowed_levels, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [id, position.name, position.category, JSON.stringify(position.allowedLevels), position.isActive ? 1 : 0, position.sortOrder]);
}

/** MariaDB stores JSON as text, so the driver may hand back a string. */
export function levelsOf(value: string | string[] | null): string[] {
  if (value === null) return [];
  return Array.isArray(value) ? value : JSON.parse(value) as string[];
}

async function withDuplicateName<T>(work: () => Promise<T>): Promise<T | { ok: false; code: 'DUPLICATE_NAME' }> {
  try {
    return await work();
  } catch (error) {
    if (error && typeof error === 'object' && 'errno' in error && error.errno === 1062) return { ok: false, code: 'DUPLICATE_NAME' };
    throw error;
  }
}
