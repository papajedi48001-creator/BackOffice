import { randomUUID } from 'node:crypto';
import type { AccessSubject, PttypeMappingInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { canManagePttypeMapping } from './pttype-mapping-access';
import { readPttypeMappings, writePttypeMapping, type MappingSide, type MappingSnapshot, type MappingWrite } from './pttype-mapping-hosxp';

export type MappingIo = { read: typeof readPttypeMappings; write: typeof writePttypeMapping };
export type SideChange = { from: string | null; to: string | null };
/** ผู้แก้ล่าสุด of a สิทธิ in BackOffice; `at` is UTC ISO. Left out when the latest HOSxP stamp is not that save (edited straight in HOSxP). */
export type MappingEditor = { name: string | null; at: string };
export type MappingLoad = { ok: true; snapshot: MappingSnapshot; editors: Record<string, MappingEditor> } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export type MappingSave = { ok: true } | { ok: false; code: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'HOSXP_FAILED' | 'NO_WRITE_PERMISSION' | Extract<MappingWrite, { ok: false }>['code'] };
/** One row of ประวัติการแก้ไข; a side is null when that save left it unchanged. */
export type MappingHistoryRow = { id: string; at: string; actorName: string | null; pttype: string; opd: SideChange | null; ipd: SideChange | null };

const UPDATE = 'pttype_mapping.update';
/** Allowed gap between BackOffice's clock and HOSxP's when matching a save to its `last_modify`. */
const STAMP_TOLERANCE_MS = 10 * 60_000;
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

/**
 * Whether a BackOffice save (`at`, UTC ISO) is the change behind HOSxP's latest stamp (Bangkok wall time). A later
 * stamp means someone edited straight in HOSxP, so the BackOffice editor must not be named. No stamp: nothing to contradict.
 */
export function editorMatchesStamp(at: string, stamp: string | null): boolean {
  if (stamp === null) return true;
  const stampMs = Date.parse(`${stamp.replace(' ', 'T')}Z`) - BANGKOK_OFFSET_MS;
  return Number.isFinite(stampMs) && Math.abs(stampMs - Date.parse(at)) <= STAMP_TOLERANCE_MS;
}
const latestStamp = (stamps: (string | null | undefined)[]) => stamps.filter((stamp): stamp is string => Boolean(stamp)).sort().at(-1) ?? null;
const EDITOR_WINDOW = 2000;
/** MariaDB refusals that mean the HOSxP account may read but not write: table, column or database access denied. */
const WRITE_DENIED = new Set([1142, 1143, 1044]);

const driverCode = (error: unknown) => {
  const { errno, code } = (typeof error === 'object' && error !== null ? error : {}) as { errno?: unknown; code?: unknown };
  return { errno: typeof errno === 'number' ? errno : null, code: typeof code === 'string' ? code : 'UNKNOWN' };
};
/** The driver's message can name the host and user, so only its code is logged. */
const logFailure = (what: string, error: unknown) => console.error(`[pttype-mapping] ${what} failed`, driverCode(error).code);

type AuditRow = { id: string; target_id: string; metadata: string | Record<string, unknown>; at: string; actor_name: string | null };
const parse = (metadata: AuditRow['metadata']) => (typeof metadata === 'string' ? JSON.parse(metadata) as Record<string, unknown> : metadata);
const side = (value: unknown): SideChange | null => (value && typeof value === 'object' ? { from: (value as SideChange).from ?? null, to: (value as SideChange).to ?? null } : null);

/** Mapping สิทธิ: HOSxP through the connection under ตั้งค่าการเชื่อมต่อ, who changed what in BackOffice's audit. */
export class PttypeMappingService {
  constructor(private readonly database: Database, private readonly resolveConnection: () => Promise<HosxpConnection | null>, private readonly io: MappingIo = { read: readPttypeMappings, write: writePttypeMapping }, private readonly createId: () => string = randomUUID) {}

  async load(): Promise<MappingLoad> {
    const connection = await this.resolveConnection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    let snapshot: MappingSnapshot;
    try { snapshot = await this.io.read(connection); } catch (error) { logFailure('HOSxP read', error); return { ok: false, code: 'HOSXP_FAILED' }; }
    const editors: Record<string, MappingEditor> = {};
    for (const row of await this.auditRows(EDITOR_WINDOW)) editors[row.target_id] ??= { name: row.actor_name, at: row.at };
    for (const right of snapshot.rights) {
      const editor = editors[right.code];
      if (editor && !editorMatchesStamp(editor.at, latestStamp([right.opd?.modifiedAt, right.ipd?.modifiedAt]))) delete editors[right.code];
    }
    return { ok: true, snapshot, editors };
  }

  async save(subject: AccessSubject & { personId: string }, pttype: string, input: PttypeMappingInput): Promise<MappingSave> {
    if (!canManagePttypeMapping(subject)) return { ok: false, code: 'FORBIDDEN' };
    const connection = await this.resolveConnection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    let written: MappingWrite;
    try { written = await this.io.write(connection, pttype, input); } catch (error) {
      logFailure('HOSxP write', error);
      return { ok: false, code: WRITE_DENIED.has(driverCode(error).errno ?? 0) ? 'NO_WRITE_PERMISSION' : 'HOSXP_FAILED' };
    }
    if (!written.ok) return written;
    const changes: Partial<Record<MappingSide, SideChange>> = {};
    for (const key of ['opd', 'ipd'] as const) if (written.from[key] !== input[key]) changes[key] = { from: written.from[key], to: input[key] };
    // HOSxP has already changed, so a lost audit row is logged rather than reported as a failed save.
    try { await this.audit(subject.personId, UPDATE, 'pttype', pttype, { pttype, ...changes }); } catch (error) { logFailure('audit', error); }
    return { ok: true };
  }

  async history(limit = 200): Promise<MappingHistoryRow[]> {
    return (await this.auditRows(limit)).map((row) => {
      const metadata = parse(row.metadata);
      return { id: row.id, at: row.at, actorName: row.actor_name, pttype: row.target_id, opd: side(metadata.opd), ipd: side(metadata.ipd) };
    });
  }

  /** ส่งออกข้อมูล: who and how many rows, never the rows. */
  recordExport(personId: string, rows: number): Promise<void> {
    return this.audit(personId, 'pttype_mapping.export', 'module', 'pttype-mapping', { exportKind: 'pttype-mapping', rows });
  }

  private auditRows(limit: number): Promise<AuditRow[]> {
    return this.database.query<AuditRow>(
      "SELECT e.id, e.target_id, e.metadata, DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS at, p.display_name AS actor_name FROM audit_event e LEFT JOIN person p ON p.id = e.actor_person_id WHERE e.action = ? ORDER BY e.created_at DESC, e.id DESC LIMIT ?",
      [UPDATE, limit]);
  }

  private audit(actorPersonId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(this.database), this.createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}
