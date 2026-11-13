import { moneyPageSchema, type MoneyPage } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export type MoneyMemberRow = { personId: string; displayName: string; employeeCode: string | null; pages: MoneyPage[] };

export class MoneyQueries {
  constructor(private readonly database: Database) {}

  /** เจ้าหน้าที่ Smart Money with their pages, by name. */
  async members(): Promise<MoneyMemberRow[]> {
    const rows = await this.database.query<{ person_id: string; display_name: string; employee_code: string | null; page: string | null }>('SELECT m.person_id, p.display_name, p.employee_code, g.page FROM money_member m JOIN person p ON p.id = m.person_id LEFT JOIN money_member_page g ON g.person_id = m.person_id ORDER BY p.display_name, m.person_id, g.page');
    const known = new Set<string>(moneyPageSchema.options);
    const byPerson = new Map<string, MoneyMemberRow>();
    for (const row of rows) {
      const member = byPerson.get(row.person_id) ?? { personId: row.person_id, displayName: row.display_name, employeeCode: row.employee_code, pages: [] };
      if (row.page && known.has(row.page)) member.pages.push(row.page as MoneyPage);
      byPerson.set(row.person_id, member);
    }
    return [...byPerson.values()];
  }
}
