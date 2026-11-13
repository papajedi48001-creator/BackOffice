import { randomUUID } from 'node:crypto';
import { moneyMemberInputSchema, type AccessSubject, type MoneyMemberInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canManageMoney } from './money-access';
import { isMissingReference, moneyAudit } from './money-db';

export type MoneyMemberResult = { ok: true } | { ok: false; code: 'FORBIDDEN' | 'NOT_FOUND' };

/** เจ้าหน้าที่ Smart Money: only a `money.manage` holder adds, changes or removes them. */
export class MoneyMemberService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** Adds or changes one member; their pages are replaced. */
  async saveMember(subject: AccessSubject, input: MoneyMemberInput): Promise<MoneyMemberResult> {
    const member = moneyMemberInputSchema.parse(input);
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    const pages = [...new Set(member.pages)];
    try {
      return await this.database.transaction(async (database) => {
        await database.execute('INSERT INTO money_member (person_id, created_at, created_by) VALUES (?, UTC_TIMESTAMP(), ?) ON DUPLICATE KEY UPDATE person_id = person_id', [member.personId, actor]);
        await database.execute('DELETE FROM money_member_page WHERE person_id = ?', [member.personId]);
        for (const page of pages) await database.execute('INSERT INTO money_member_page (person_id, page) VALUES (?, ?)', [member.personId, page]);
        await moneyAudit(database, this.createId, actor, 'money.member.save', 'person', member.personId, { pages: pages.length });
        return { ok: true as const };
      });
    } catch (error) {
      if (isMissingReference(error)) return { ok: false, code: 'NOT_FOUND' };
      throw error;
    }
  }

  async removeMember(subject: AccessSubject, personId: string): Promise<MoneyMemberResult> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      if ((await database.query('SELECT person_id FROM money_member WHERE person_id = ? FOR UPDATE', [personId])).length === 0) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM money_member WHERE person_id = ?', [personId]);
      await moneyAudit(database, this.createId, actor, 'money.member.remove', 'person', personId, {});
      return { ok: true as const };
    });
  }
}
