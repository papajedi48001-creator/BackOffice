import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { NavigationItem } from '../components/app-shell';
import type { BellItem } from '../components/notification-bell';
import { collectBadges } from './dashboard-badges';
import { availableModules, moduleLabel, navigationFrom, visibleModules } from './modules';

export interface ShellData { navigation: NavigationItem[]; bell: { unread: number; items: BellItem[] }; }

type NoticeRow = Omit<BellItem, 'moduleLabel'> & { moduleCode: string | null };

async function recentNotices(db: Database, personId: string): Promise<BellItem[]> {
  try {
    const rows = await db.query<NoticeRow>(`SELECT id, module_code AS moduleCode, subject,
        DATE_FORMAT(read_at, '%Y-%m-%dT%H:%i:%s.000Z') AS readAt, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
      FROM notification WHERE recipient_person_id = ? AND channel = ? ORDER BY created_at DESC, id LIMIT 10`, [personId, 'in_app']);
    return rows.map(({ moduleCode, ...row }) => ({ ...row, moduleLabel: moduleLabel(moduleCode) }));
  } catch (error) {
    console.error('bell_notifications_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return [];
  }
}

/** Sidebar items with their counts, and the bell's newest notices; anything that fails to load is left out so the page still renders. */
export async function loadShellData(db: Database, subject: AccessSubject): Promise<ShellData> {
  const modules = await availableModules(visibleModules(subject), db, subject);
  const [badges, items] = await Promise.all([collectBadges(modules, db, subject), subject.personId ? recentNotices(db, subject.personId) : Promise.resolve([])]);
  return { navigation: navigationFrom(modules, badges), bell: { unread: badges.notifications ?? 0, items } };
}
