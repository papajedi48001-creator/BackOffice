import { createDatabase, type Database } from '@backoffice/db';

/** Unread in-app notifications for the menu badge; undefined when the count cannot be read, so the page still renders. */
export async function readUnreadNotifications(personId: string, open: () => Database): Promise<number | undefined> {
  let database: Database | undefined;
  try {
    database = open();
    const count = (await database.query<{ unreadCount: number }>('SELECT COUNT(*) AS unreadCount FROM notification WHERE recipient_person_id = ? AND channel = ? AND read_at IS NULL', [personId, 'in_app']))[0];
    return Number(count?.unreadCount ?? 0);
  } catch (error) {
    console.error('unread_notifications_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return undefined;
  } finally {
    await database?.close().catch(() => undefined);
  }
}

export const openDatabase = (url: string) => () => createDatabase(url);
