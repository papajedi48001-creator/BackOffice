import type { AccessSubject } from '@backoffice/contracts';
import { SupportChatService, isAdmin } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import type { NavigationItem } from '../components/app-shell';
import type { BellItem, ShellProfile } from '../components/profile-menu';
import { attachmentsEnabled } from './attachments';
import { collectBadges } from './dashboard-badges';
import { readModuleModes } from './module-gate';
import { availableModules, moduleLabel, navigationFrom, usableModules, visibleModules } from './modules';
import { profilePhotoUrl } from './profile-photo';

/** แชตกับผู้ดูแลระบบ button: whether this person answers the shared inbox, whether pictures can be kept, and what waits. */
export interface ShellChat { admin: boolean; images: boolean; unread: number; }
export interface ShellData { navigation: NavigationItem[]; profile: ShellProfile; bell: { unread: number; items: BellItem[] }; chat: ShellChat; }
export const noChat = (subject: AccessSubject): ShellChat => ({ admin: isAdmin(subject), images: attachmentsEnabled(), unread: 0 });

async function chatUnread(db: Database, subject: AccessSubject): Promise<number> {
  try {
    return await new SupportChatService(db).unreadCount(subject);
  } catch (error) {
    console.error('support_chat_count_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return 0;
  }
}
export const emptyProfile: ShellProfile = { displayName: null, positionTitle: null, photoUrl: null };

type NoticeRow = Omit<BellItem, 'moduleLabel'> & { moduleCode: string | null };

async function recentNotices(db: Database, personId: string): Promise<BellItem[]> {
  try {
    const rows = await db.query<NoticeRow>(`SELECT id, module_code AS moduleCode, subject,
        DATE_FORMAT(read_at, '%Y-%m-%dT%H:%i:%s.000Z') AS readAt, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAt
      FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL ORDER BY created_at DESC, id LIMIT 10`, [personId, 'in_app']);
    return rows.map(({ moduleCode, ...row }) => ({ ...row, moduleLabel: moduleLabel(moduleCode), ...(moduleCode ? { module: moduleCode } : {}) }));
  } catch (error) {
    console.error('bell_notifications_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return [];
  }
}

async function signedInProfile(db: Database, personId: string): Promise<ShellProfile> {
  try {
    const [row] = await db.query<{ displayName: string | null; positionTitle: string | null; photoAttachmentId: string | null }>(`SELECT p.display_name AS displayName, p.position_title AS positionTitle, pr.photo_attachment_id AS photoAttachmentId
      FROM person p LEFT JOIN hr_person_profile pr ON pr.person_id = p.id WHERE p.id = ?`, [personId]);
    if (!row) return emptyProfile;
    return { displayName: row.displayName, positionTitle: row.positionTitle, photoUrl: row.photoAttachmentId && attachmentsEnabled() ? profilePhotoUrl(personId, row.photoAttachmentId) : null };
  } catch (error) {
    console.error('shell_profile_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return emptyProfile;
  }
}

/** Sidebar items with their counts, the signed-in person's chip and their newest unread notices; anything that fails to load is left out so the page still renders. */
export async function loadShellData(db: Database, subject: AccessSubject): Promise<ShellData> {
  const modes = await readModuleModes(db);
  const modules = await availableModules(usableModules(visibleModules(subject), modes, subject), db, subject);
  const [badges, items, profile, chat] = await Promise.all([collectBadges(modules, db, subject), subject.personId ? recentNotices(db, subject.personId) : Promise.resolve([]), subject.personId ? signedInProfile(db, subject.personId) : Promise.resolve(emptyProfile), chatUnread(db, subject)]);
  return { navigation: navigationFrom(modules, badges, modes), profile, bell: { unread: badges.notifications ?? 0, items }, chat: { ...noChat(subject), unread: chat } };
}
