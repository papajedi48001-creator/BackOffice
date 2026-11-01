import type { AccessSubject, ModuleMode } from '@backoffice/contracts';
import { AdminQueries, canUseModule, lockedModules } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { moduleRegistry } from './modules';

export type ModuleModes = Readonly<Record<string, ModuleMode>>;

const liveModules = moduleRegistry.filter((entry) => entry.status === 'live').map((entry) => ({ code: entry.code, href: entry.href }));

/** The live module a page (`/leave/mine`) or its API (`/api/leave/settings`) belongs to; `null` for shared paths. */
export function moduleForPath(pathname: string): string | null {
  const path = pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname;
  return liveModules.find((entry) => path === entry.href || path.startsWith(`${entry.href}/`))?.code ?? null;
}

/** A module's mode; one never set is ON. */
export function modeOf(modes: ModuleModes, moduleCode: string): ModuleMode {
  return modes[moduleCode] ?? 'ON';
}

/**
 * What to refuse: every page and API of an OFF module for everyone, and of a DEVELOPMENT module for anyone who is not
 * ผู้ดูแลระบบ, its ผู้จัดการ or its ผู้ทดสอบ. `subject` is only read for a DEVELOPMENT module. The admin module is never refused.
 */
export async function gateDecision(pathname: string, modes: ModuleModes, subject: () => Promise<AccessSubject | null>): Promise<{ moduleCode: string; api: boolean } | null> {
  const moduleCode = moduleForPath(pathname);
  if (!moduleCode || lockedModules.includes(moduleCode)) return null;
  const mode = modeOf(modes, moduleCode);
  if (mode === 'ON') return null;
  if (mode === 'DEVELOPMENT') {
    const person = await subject();
    if (person && canUseModule(person, moduleCode, mode)) return null;
  }
  return { moduleCode, api: pathname.startsWith('/api/') };
}

/** Every module's mode; an unreadable setting (no migration yet, database down) counts as all ON, and the module's own queries fail anyway. */
export async function readModuleModes(database: Pick<Database, 'query'>): Promise<ModuleModes> {
  try { return await new AdminQueries(database).moduleModes(); } catch (error) {
    console.error('module_settings_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return {};
  }
}
