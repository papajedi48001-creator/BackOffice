import type { AccessSubject } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { ModuleEntry } from './modules';

const badgeTimeoutMs = 2000;

function withinTime(work: Promise<number>, timeoutMs: number): Promise<number> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('BADGE_TIMEOUT')), timeoutMs); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Loads every module's badge at once; a module whose count fails, throws or stalls simply shows no badge. */
export async function collectBadges(modules: ModuleEntry[], db: Database, subject: AccessSubject, timeoutMs = badgeTimeoutMs): Promise<Record<string, number | undefined>> {
  const withBadge = modules.filter((entry) => entry.status === 'live' && entry.badge);
  const results = await Promise.allSettled(withBadge.map((entry) => withinTime(Promise.resolve().then(() => entry.badge!(db, subject)), timeoutMs)));
  return Object.fromEntries(withBadge.map((entry, index) => {
    const result = results[index]!;
    return [entry.code, result.status === 'fulfilled' ? result.value : undefined];
  }));
}
