import { randomUUID } from 'node:crypto';
import { lineGroupIdSchema, lineGroupInputSchema, lineUserIdSchema } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { generateLinkCode, hashLinkCode, LINK_CODE_TTL_MS } from './link-code';

type Tx = Pick<Database, 'execute' | 'query'>;
export interface LineGroupRow { groupId: string; displayName: string | null; source: 'WEBHOOK' | 'MANUAL'; active: boolean; joinedAt: string }
export interface LineOverview { groups: LineGroupRow[]; routes: Record<string, string>; linkedCount: number }

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T')}Z`)).toISOString();

/**
 * การแจ้งเตือน LINE: บัญชี LINE ที่เชื่อมต่อ, กลุ่ม LINE and กลุ่มแจ้งเตือนของโมดูล. Callers check who may act (the person
 * themselves, ผู้ดูแลระบบ, or a signed webhook). Each change and its audit row share one transaction. The รหัสเชื่อมต่อ and the
 * LINE user id never go into an audit row.
 */
export class LineService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** A new code replaces the person's previous one. Only its sha256 is stored. */
  async createLinkCode(personId: string): Promise<{ code: string; expiresAt: string }> {
    const code = generateLinkCode();
    const ttlSeconds = LINK_CODE_TTL_MS / 1000;
    return this.database.transaction(async (tx) => {
      await tx.execute('DELETE FROM line_link_code WHERE person_id = ?', [personId]);
      await tx.execute('INSERT INTO line_link_code (code_hash, person_id, expires_at, created_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), UTC_TIMESTAMP())', [hashLinkCode(code), personId, ttlSeconds]);
      const [row] = await tx.query<{ expiresAt: Date | string }>('SELECT expires_at AS expiresAt FROM line_link_code WHERE person_id = ?', [personId]);
      await this.audit(tx, personId, 'line.account.link_code_created', 'person', personId);
      return { code, expiresAt: iso(row!.expiresAt) };
    });
  }

  /** A LINE user sent a code: link them to its person, once. The LINE account leaves anyone it was linked to before. */
  async linkByCode(code: string, lineUserId: string): Promise<{ ok: true; personId: string } | { ok: false }> {
    const userId = lineUserIdSchema.parse(lineUserId);
    return this.database.transaction(async (tx) => {
      const [found] = await tx.query<{ personId: string }>('SELECT person_id AS personId FROM line_link_code WHERE code_hash = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [hashLinkCode(code)]);
      if (!found) return { ok: false as const };
      await tx.execute('DELETE FROM line_link_code WHERE person_id = ?', [found.personId]);
      const previous = await tx.query<{ personId: string }>('SELECT person_id AS personId FROM line_account_link WHERE line_user_id = ? AND person_id <> ? FOR UPDATE', [userId, found.personId]);
      for (const { personId } of previous) await this.audit(tx, found.personId, 'line.account.unlinked', 'person', personId, { reason: 'MOVED' });
      await tx.execute('DELETE FROM line_account_link WHERE line_user_id = ? OR person_id = ?', [userId, found.personId]);
      await tx.execute('INSERT INTO line_account_link (person_id, line_user_id, linked_at) VALUES (?, ?, UTC_TIMESTAMP())', [found.personId, userId]);
      await this.audit(tx, found.personId, 'line.account.linked', 'person', found.personId);
      return { ok: true as const, personId: found.personId };
    });
  }

  async unlink(personId: string): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const held = await tx.query<{ personId: string }>('SELECT person_id AS personId FROM line_account_link WHERE person_id = ? FOR UPDATE', [personId]);
      if (held.length === 0) return false;
      await tx.execute('DELETE FROM line_account_link WHERE person_id = ?', [personId]);
      await this.audit(tx, personId, 'line.account.unlinked', 'person', personId);
      return true;
    });
  }

  /** Webhook `unfollow`: the person blocked the bot, so they are no longer @mentioned. */
  async unlinkLineUser(lineUserId: string): Promise<boolean> {
    const userId = lineUserIdSchema.parse(lineUserId);
    return this.database.transaction(async (tx) => {
      const [held] = await tx.query<{ personId: string }>('SELECT person_id AS personId FROM line_account_link WHERE line_user_id = ? FOR UPDATE', [userId]);
      if (!held) return false;
      await tx.execute('DELETE FROM line_account_link WHERE line_user_id = ?', [userId]);
      await this.audit(tx, null, 'line.account.unlinked', 'person', held.personId, { reason: 'UNFOLLOWED' });
      return true;
    });
  }

  /** Whether a group is known and the bot is still in it. */
  async isActiveGroup(groupId: string): Promise<boolean> {
    const rows = await this.database.query<{ groupId: string }>('SELECT group_id AS groupId FROM line_group WHERE group_id = ? AND left_at IS NULL', [groupId]);
    return rows.length === 1;
  }

  async linkStatus(personId: string): Promise<{ linkedAt: string } | null> {
    const [row] = await this.database.query<{ linkedAt: Date | string }>('SELECT linked_at AS linkedAt FROM line_account_link WHERE person_id = ?', [personId]);
    return row ? { linkedAt: iso(row.linkedAt) } : null;
  }

  async lineUserIdOf(personId: string): Promise<string | null> {
    const [row] = await this.database.query<{ lineUserId: string }>('SELECT line_user_id AS lineUserId FROM line_account_link WHERE person_id = ?', [personId]);
    return row?.lineUserId ?? null;
  }

  /** The bot was invited into a group (webhook `join`). A known name is kept when LINE gives none. */
  async groupJoined(groupId: string, displayName: string | null): Promise<void> {
    const id = lineGroupIdSchema.parse(groupId);
    await this.database.transaction(async (tx) => {
      await tx.execute("INSERT INTO line_group (group_id, display_name, source, joined_at, left_at) VALUES (?, ?, 'WEBHOOK', UTC_TIMESTAMP(), NULL) ON DUPLICATE KEY UPDATE display_name = COALESCE(VALUES(display_name), display_name), joined_at = VALUES(joined_at), left_at = NULL", [id, displayName?.slice(0, 120) ?? null]);
      await this.audit(tx, null, 'line.group.joined', 'line_group', id);
    });
  }

  /** The bot left or was removed (webhook `leave`); routes to the group stop sending. */
  async groupLeft(groupId: string): Promise<void> {
    const id = lineGroupIdSchema.parse(groupId);
    await this.database.transaction(async (tx) => {
      await tx.execute('UPDATE line_group SET left_at = UTC_TIMESTAMP() WHERE group_id = ?', [id]);
      await this.audit(tx, null, 'line.group.left', 'line_group', id);
    });
  }

  /** เพิ่มกลุ่มเอง: for a group whose join event never reached the system. */
  async addGroup(actorPersonId: string, input: { groupId: string; displayName: string }): Promise<{ ok: true }> {
    const valid = lineGroupInputSchema.parse(input);
    return this.database.transaction(async (tx) => {
      await tx.execute("INSERT INTO line_group (group_id, display_name, source, joined_at, left_at) VALUES (?, ?, 'MANUAL', UTC_TIMESTAMP(), NULL) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), left_at = NULL", [valid.groupId, valid.displayName]);
      await this.audit(tx, actorPersonId, 'line.group.added', 'line_group', valid.groupId, { displayName: valid.displayName });
      return { ok: true as const };
    });
  }

  /** กลุ่มแจ้งเตือนของโมดูล: a known group, or null for "ไม่ส่ง LINE". */
  async setRoute(actorPersonId: string, moduleCode: string, groupId: string | null): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }> {
    const id = groupId === null ? null : lineGroupIdSchema.parse(groupId);
    return this.database.transaction(async (tx) => {
      if (id !== null) {
        const known = await tx.query<{ groupId: string }>('SELECT group_id AS groupId FROM line_group WHERE group_id = ? FOR UPDATE', [id]);
        if (known.length === 0) return { ok: false as const, code: 'NOT_FOUND' as const };
        await tx.execute('INSERT INTO line_module_route (module_code, group_id, updated_by_person_id, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE group_id = VALUES(group_id), updated_by_person_id = VALUES(updated_by_person_id), updated_at = VALUES(updated_at)', [moduleCode, id, actorPersonId]);
      } else {
        await tx.execute('DELETE FROM line_module_route WHERE module_code = ?', [moduleCode]);
      }
      await this.audit(tx, actorPersonId, 'line.route.changed', 'module', moduleCode, { moduleCode, groupId: id });
      return { ok: true as const };
    });
  }

  /** The group a module's alerts go to, only while the bot is still in it. */
  async routeFor(moduleCode: string): Promise<{ groupId: string } | null> {
    const [row] = await this.database.query<{ groupId: string }>('SELECT r.group_id AS groupId FROM line_module_route r JOIN line_group g ON g.group_id = r.group_id WHERE r.module_code = ? AND g.left_at IS NULL', [moduleCode]);
    return row ?? null;
  }

  async overview(): Promise<LineOverview> {
    const groups = await this.database.query<{ groupId: string; displayName: string | null; source: 'WEBHOOK' | 'MANUAL'; leftAt: Date | string | null; joinedAt: Date | string }>('SELECT group_id AS groupId, display_name AS displayName, source, left_at AS leftAt, joined_at AS joinedAt FROM line_group ORDER BY left_at IS NOT NULL, display_name, group_id');
    const routes = await this.database.query<{ moduleCode: string; groupId: string }>('SELECT module_code AS moduleCode, group_id AS groupId FROM line_module_route');
    const [count] = await this.database.query<{ total: number | string }>('SELECT COUNT(*) AS total FROM line_account_link');
    return {
      groups: groups.map((row) => ({ groupId: row.groupId, displayName: row.displayName, source: row.source, active: row.leftAt === null, joinedAt: iso(row.joinedAt) })),
      routes: Object.fromEntries(routes.map((row) => [row.moduleCode, row.groupId])),
      linkedCount: Number(count?.total ?? 0)
    };
  }

  private audit(tx: Tx, actorPersonId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(tx), this.createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}
