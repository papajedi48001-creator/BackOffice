import { grantableRoleSchema, moduleModeSchema, type GrantableRole, type ModuleMode } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export interface AdminGrantRow {
  personId: string;
  displayName: string | null;
  employeeCode: string | null;
  positionTitle: string | null;
  active: boolean;
  roleNames: GrantableRole[];
  /** Hospital-wide HR เจ้าของข้อมูล: HR, leave and travel manager roles only take effect with it (an admin does not need it). */
  ownsHrData: boolean;
}

export interface AdminPersonOption { personId: string; displayName: string | null; employeeCode: string | null; organizationName: string | null }

export interface AdminAuditRow { id: string; createdAt: string; action: string; actorName: string | null; targetType: string; targetId: string; targetName: string | null; roleName: string | null; moduleCode: string | null }

const grantable = grantableRoleSchema.options;
const placeholders = grantable.map(() => '?').join(', ');

/** Reads for the admin module. Callers check `isAdmin` first. */
export class AdminQueries {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async disabledModules(): Promise<string[]> {
    return Object.entries(await this.moduleModes()).filter(([, mode]) => mode === 'OFF').map(([code]) => code);
  }

  /** Every module whose mode was set; a module missing here is ON. An unknown stored value counts as OFF, the safe side. */
  async moduleModes(): Promise<Record<string, ModuleMode>> {
    const rows = await this.database.query<{ code: string; mode: string }>('SELECT module_code AS code, mode FROM admin_module_setting ORDER BY module_code');
    return Object.fromEntries(rows.map((row) => [row.code, moduleModeSchema.safeParse(row.mode).data ?? 'OFF']));
  }

  /** Every hospital-wide admin and manager grant, one row per person, sorted by name. */
  async grants(): Promise<AdminGrantRow[]> {
    const rows = await this.database.query<{ personId: string; displayName: string | null; employeeCode: string | null; positionTitle: string | null; status: string; roleName: string; ownsHrData: number | string }>(
      `SELECT p.id AS personId, p.display_name AS displayName, p.employee_code AS employeeCode, p.position_title AS positionTitle, p.employment_status AS status, r.name AS roleName,
        EXISTS (SELECT 1 FROM data_owner_assignment d WHERE d.person_id = p.id AND d.module_code = 'hr' AND d.organization_id IS NULL) AS ownsHrData
       FROM role_assignment a JOIN role r ON r.id = a.role_id JOIN person p ON p.id = a.person_id
       WHERE a.organization_id IS NULL AND r.name IN (${placeholders})
       ORDER BY p.display_name, p.id, r.name`, [...grantable]);
    const byPerson = new Map<string, AdminGrantRow>();
    for (const row of rows) {
      const entry = byPerson.get(row.personId) ?? { personId: row.personId, displayName: row.displayName, employeeCode: row.employeeCode, positionTitle: row.positionTitle, active: row.status === 'ACTIVE', roleNames: [], ownsHrData: Number(row.ownsHrData) === 1 };
      if (!entry.roleNames.includes(row.roleName as GrantableRole)) entry.roleNames.push(row.roleName as GrantableRole);
      byPerson.set(row.personId, entry);
    }
    return [...byPerson.values()];
  }

  /** Active บุคลากร matching a name or employee code, for the grant picker. */
  async people(text: string): Promise<AdminPersonOption[]> {
    const pattern = `%${text.trim().replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    return this.database.query<AdminPersonOption>(
      `SELECT p.id AS personId, p.display_name AS displayName, p.employee_code AS employeeCode, MIN(o.name) AS organizationName FROM person p
       LEFT JOIN employment_assignment ea ON ea.person_id = p.id AND ea.effective_until IS NULL LEFT JOIN organization o ON o.id = ea.organization_id
       WHERE p.employment_status = 'ACTIVE' AND (p.display_name LIKE ? ESCAPE '\\\\' OR p.employee_code LIKE ? ESCAPE '\\\\')
       GROUP BY p.id, p.display_name, p.employee_code ORDER BY p.display_name LIMIT 20`, [pattern, pattern]);
  }

  /** บันทึกของผู้ดูแล: every `admin.*` audit event, newest first. */
  async audit(limit = 200): Promise<AdminAuditRow[]> {
    const rows = await this.database.query<{ id: string; createdAt: Date | string; action: string; actorName: string | null; targetType: string; targetId: string; targetName: string | null; metadata: string }>(
      "SELECT e.id, e.created_at AS createdAt, e.action, actor.display_name AS actorName, e.target_type AS targetType, e.target_id AS targetId, target.display_name AS targetName, e.metadata FROM audit_event e LEFT JOIN person actor ON actor.id = e.actor_person_id LEFT JOIN person target ON e.target_type = 'person' AND target.id = e.target_id WHERE e.action LIKE 'admin.%' ORDER BY e.created_at DESC, e.id DESC LIMIT ?", [limit]);
    return rows.map(({ metadata, createdAt, ...row }) => {
      let parsed: { roleName?: unknown; moduleCode?: unknown } = {};
      try { parsed = JSON.parse(metadata) as typeof parsed; } catch { parsed = {}; }
      return { ...row, createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt), roleName: typeof parsed.roleName === 'string' ? parsed.roleName : null, moduleCode: typeof parsed.moduleCode === 'string' ? parsed.moduleCode : null };
    });
  }
}
