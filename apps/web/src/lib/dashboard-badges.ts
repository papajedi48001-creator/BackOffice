import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { ModuleEntry } from './modules';

/** Loads every module's badge at once; a module whose count fails simply shows no badge. */
export async function collectBadges(modules: ModuleEntry[], db: Database, subject: AccessSubject): Promise<Record<string, number | undefined>> {
  const withBadge = modules.filter((entry) => entry.status === 'live' && entry.badge);
  const results = await Promise.allSettled(withBadge.map((entry) => entry.badge!(db, subject)));
  return Object.fromEntries(withBadge.map((entry, index) => {
    const result = results[index]!;
    return [entry.code, result.status === 'fulfilled' ? result.value : undefined];
  }));
}
