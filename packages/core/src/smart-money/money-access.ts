import { moneyPageSchema, type AccessSubject, type MoneyPage } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** ผู้ดูแลระบบ or ผู้จัดการโมดูล Smart Money (`money.manage`): every page, uploads, and the member list. */
export function canManageMoney(subject: AccessSubject): boolean {
  return authorization.organizationScope(subject, 'money.manage') === 'all';
}

/** A เจ้าหน้าที่ Smart Money and the pages they may open; `null` when not a member. */
export type MoneyMember = { pages: MoneyPage[] } | null;

/** `'manage'` is for managers only; a page is open to managers and to members given that page. */
export function moneyCan(member: MoneyMember, manages: boolean, page: MoneyPage | 'manage'): boolean {
  if (manages) return true;
  if (page === 'manage' || !member) return false;
  return member.pages.includes(page);
}

/** The pages this person may open, in registry order. */
export function moneyVisiblePages(member: MoneyMember, manages: boolean): MoneyPage[] {
  return moneyPageSchema.options.filter((page) => moneyCan(member, manages, page));
}

export async function loadMoneyMember(database: Database, personId: string): Promise<MoneyMember> {
  const rows = await database.query<{ page: string | null }>('SELECT p.page FROM money_member m LEFT JOIN money_member_page p ON p.person_id = m.person_id WHERE m.person_id = ? ORDER BY p.page', [personId]);
  if (rows.length === 0) return null;
  const known = new Set<string>(moneyPageSchema.options);
  return { pages: rows.flatMap((row) => (row.page && known.has(row.page) ? [row.page as MoneyPage] : [])) };
}
