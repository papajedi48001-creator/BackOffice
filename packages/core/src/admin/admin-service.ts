import { randomUUID } from 'node:crypto';
import { grantableRoleSchema, moduleModeSchema, type GrantableRole, type ModuleMode } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { ADMIN_ROLE } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { lockedModules } from './module-managers';

type Tx = Pick<Database, 'execute' | 'query'>;
export type AdminFailure = 'NOT_FOUND' | 'PERSON_NOT_ACTIVE' | 'LAST_ADMIN' | 'MODULE_LOCKED';

/**
 * ตั้งค่าโปรแกรม and กำหนดสิทธิ. Callers check `isAdmin` first. Each change and its audit row share one transaction.
 * Admin and manager grants are hospital-wide role assignments (organization_id NULL); unit-scoped ones are left alone.
 */
export class AdminService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** ตั้งค่าโปรแกรม: ON, OFF or DEVELOPMENT. `enabled` is kept in step for readers of the old column. Setting the current mode changes nothing. */
  async setModuleMode(actorPersonId: string, moduleCode: string, mode: ModuleMode): Promise<{ ok: true; changed: boolean } | { ok: false; code: 'MODULE_LOCKED' }> {
    const toMode = moduleModeSchema.parse(mode);
    if (lockedModules.includes(moduleCode)) return { ok: false, code: 'MODULE_LOCKED' };
    return this.database.transaction(async (tx) => {
      const [current] = await tx.query<{ mode: string }>('SELECT mode FROM admin_module_setting WHERE module_code = ? FOR UPDATE', [moduleCode]);
      const fromMode = current ? (moduleModeSchema.safeParse(current.mode).data ?? 'OFF') : 'ON';
      if (fromMode === toMode) return { ok: true as const, changed: false };
      await tx.execute('INSERT INTO admin_module_setting (module_code, enabled, mode, updated_by_person_id, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), mode = VALUES(mode), updated_by_person_id = VALUES(updated_by_person_id), updated_at = VALUES(updated_at)', [moduleCode, toMode === 'OFF' ? 0 : 1, toMode, actorPersonId]);
      await this.audit(tx, actorPersonId, 'admin.module.mode_changed', 'module', moduleCode, { moduleCode, fromMode, toMode });
      return { ok: true as const, changed: true };
    });
  }

  async grantRole(actorPersonId: string, personId: string, roleName: GrantableRole): Promise<{ ok: true; changed: boolean } | { ok: false; code: AdminFailure }> {
    const role = grantableRoleSchema.parse(roleName);
    return this.database.transaction(async (tx) => {
      const refused = await this.checkPerson(tx, personId);
      if (refused) return { ok: false as const, code: refused };
      return { ok: true as const, changed: await this.grant(tx, actorPersonId, personId, role) };
    });
  }

  async revokeRole(actorPersonId: string, personId: string, roleName: GrantableRole): Promise<{ ok: true } | { ok: false; code: AdminFailure }> {
    const role = grantableRoleSchema.parse(roleName);
    return this.database.transaction(async (tx) => {
      const admins = await this.lockAdmins(tx);
      if (role === ADMIN_ROLE && admins.includes(personId) && admins.length <= 1) return { ok: false as const, code: 'LAST_ADMIN' as const };
      return (await this.revoke(tx, actorPersonId, personId, role)) ? { ok: true as const } : { ok: false as const, code: 'NOT_FOUND' as const };
    });
  }

  /** แก้ไขสิทธิ: the person ends up with exactly `roleNames` among the grantable roles. */
  async setPersonRoles(actorPersonId: string, personId: string, roleNames: GrantableRole[]): Promise<{ ok: true; granted: GrantableRole[]; revoked: GrantableRole[] } | { ok: false; code: AdminFailure }> {
    const wanted = [...new Set(roleNames.map((name) => grantableRoleSchema.parse(name)))].sort();
    return this.database.transaction(async (tx) => {
      const admins = await this.lockAdmins(tx);
      const current = await this.heldRoles(tx, personId);
      const granted = wanted.filter((role) => !current.includes(role));
      const revoked = current.filter((role) => !wanted.includes(role));
      if (granted.length > 0) {
        const refused = await this.checkPerson(tx, personId);
        if (refused) return { ok: false as const, code: refused };
      }
      if (revoked.includes(ADMIN_ROLE) && admins.length <= 1) return { ok: false as const, code: 'LAST_ADMIN' as const };
      for (const role of granted) await this.grant(tx, actorPersonId, personId, role);
      for (const role of revoked) await this.revoke(tx, actorPersonId, personId, role);
      return { ok: true as const, granted, revoked };
    });
  }

  private async checkPerson(tx: Tx, personId: string): Promise<'NOT_FOUND' | 'PERSON_NOT_ACTIVE' | null> {
    const [person] = await tx.query<{ status: string }>('SELECT employment_status AS status FROM person WHERE id = ? FOR UPDATE', [personId]);
    if (!person) return 'NOT_FOUND';
    return person.status === 'ACTIVE' ? null : 'PERSON_NOT_ACTIVE';
  }

  /** Locks every hospital-wide admin assignment, always first, so two removals cannot each see the other as the remaining admin. */
  private async lockAdmins(tx: Tx): Promise<string[]> {
    const rows = await tx.query<{ personId: string }>('SELECT a.person_id AS personId FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE r.name = ? AND a.organization_id IS NULL FOR UPDATE', [ADMIN_ROLE]);
    return [...new Set(rows.map((row) => row.personId))];
  }

  private async heldRoles(tx: Tx, personId: string): Promise<GrantableRole[]> {
    const rows = await tx.query<{ name: string }>('SELECT DISTINCT r.name AS name FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE a.person_id = ? AND a.organization_id IS NULL FOR UPDATE', [personId]);
    return rows.map((row) => row.name).filter((name): name is GrantableRole => grantableRoleSchema.safeParse(name).success).sort();
  }

  private async grant(tx: Tx, actorPersonId: string, personId: string, role: GrantableRole): Promise<boolean> {
    await tx.execute('INSERT IGNORE INTO role (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [this.createId(), role]);
    const [roleRow] = await tx.query<{ id: string }>('SELECT id FROM role WHERE name = ? LIMIT 1', [role]);
    const [held] = await tx.query<{ id: string }>('SELECT id FROM role_assignment WHERE person_id = ? AND role_id = ? AND organization_id IS NULL LIMIT 1 FOR UPDATE', [personId, roleRow!.id]);
    if (held) return false;
    await tx.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())', [this.createId(), personId, roleRow!.id]);
    await this.audit(tx, actorPersonId, 'admin.role.granted', 'person', personId, { personId, roleName: role });
    return true;
  }

  private async revoke(tx: Tx, actorPersonId: string, personId: string, role: GrantableRole): Promise<boolean> {
    const held = await tx.query<{ id: string }>('SELECT a.id FROM role_assignment a JOIN role r ON r.id = a.role_id WHERE a.person_id = ? AND r.name = ? AND a.organization_id IS NULL FOR UPDATE', [personId, role]);
    if (held.length === 0) return false;
    await tx.execute(`DELETE FROM role_assignment WHERE id IN (${held.map(() => '?').join(', ')})`, held.map((row) => row.id));
    await this.audit(tx, actorPersonId, 'admin.role.revoked', 'person', personId, { personId, roleName: role });
    return true;
  }

  private audit(tx: Tx, actorPersonId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(tx), this.createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}
