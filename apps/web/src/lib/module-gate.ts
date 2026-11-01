import { AdminQueries, lockedModules } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { moduleRegistry } from './modules';

const liveModules = moduleRegistry.filter((entry) => entry.status === 'live').map((entry) => ({ code: entry.code, href: entry.href }));

/** The live module a page (`/leave/mine`) or its API (`/api/leave/settings`) belongs to; `null` for shared paths. */
export function moduleForPath(pathname: string): string | null {
  const path = pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname;
  return liveModules.find((entry) => path === entry.href || path.startsWith(`${entry.href}/`))?.code ?? null;
}

/** What to refuse for a switched-off module: its pages and its APIs, for everyone. The admin module is never refused. */
export function gateDecision(pathname: string, disabled: readonly string[]): { moduleCode: string; api: boolean } | null {
  const moduleCode = moduleForPath(pathname);
  if (!moduleCode || lockedModules.includes(moduleCode) || !disabled.includes(moduleCode)) return null;
  return { moduleCode, api: pathname.startsWith('/api/') };
}

/** Switched-off module codes; an unreadable setting (no migration yet, database down) counts as none, and the module's own queries fail anyway. */
export async function readDisabledModules(database: Pick<Database, 'query'>): Promise<string[]> {
  try { return await new AdminQueries(database).disabledModules(); } catch (error) {
    console.error('module_settings_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return [];
  }
}
