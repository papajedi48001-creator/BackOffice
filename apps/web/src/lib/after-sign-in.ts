import type { Database } from '@backoffice/db';
import { sessionService } from './session';

/** Where a fresh session goes: the password change first, then the role picker for a person with several roles, else หน้าหลัก. */
export async function afterSignInPath(database: Database, token: string): Promise<'/change-password' | '/choose-role' | '/dashboard'> {
  const sessions = sessionService(database);
  if (await sessions.pendingPasswordChange(token)) return '/change-password';
  return (await sessions.resolve(token))?.roleSelectionRequired === true ? '/choose-role' : '/dashboard';
}
