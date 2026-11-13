import type { MoneyPage, Session } from '@backoffice/contracts';
import { canManageMoney, loadMoneyMember, moneyCan, moneyVisiblePages, type MoneyMember } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { leaveSession } from '../leave/leave-page';

type MoneySession = Session & { personId: string };
export type MoneyContext = { ok: true; session: MoneySession; database: Database; member: MoneyMember; manages: boolean; pages: MoneyPage[] } | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' };

/** Session and membership for a Smart Money page. `page` is checked here, on the server, before the page renders. */
export async function moneyContext({ page }: { page?: MoneyPage | 'manage' } = {}): Promise<MoneyContext> {
  const session = await leaveSession();
  if (!session) return { ok: false, reason: 'none' };
  const database = getSharedDatabase();
  if (!database) return { ok: false, reason: 'unavailable' };
  const manages = canManageMoney(session);
  const member = await loadMoneyMember(database, session.personId);
  const pages = moneyVisiblePages(member, manages);
  if (pages.length === 0 || (page && !moneyCan(member, manages, page))) return { ok: false, reason: 'forbidden' };
  return { ok: true, session, database, member, manages, pages };
}

/** The page title and why it cannot show: nothing while a visitor is sent to sign in, otherwise a no-access or load-error notice. */
export function MoneyPageMessage({ title, reason }: { title: string; reason: 'none' | 'forbidden' | 'unavailable' }) {
  if (reason === 'none') return null;
  return <section><h2>{title}</h2><p role="alert">{reason === 'forbidden' ? 'ยังไม่ได้รับสิทธิ์เปิดหน้านี้ ติดต่อผู้ดูแล Smart Money' : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'}</p></section>;
}
