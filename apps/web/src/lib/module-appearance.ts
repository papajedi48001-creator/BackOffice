import { moduleAccentSchema, moduleCodeSchema, type ModuleAppearance } from '@backoffice/contracts';
import { AdminQueries } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import type { ModuleEntry } from './modules';

/** สีและไอคอน chosen on ตั้งค่าโปรแกรม, by module code. A module missing here keeps its default. */
export type ModuleAppearances = Readonly<Record<string, ModuleAppearance>>;

/** Every module's chosen colour and icon; an unreadable setting (no migration yet, database down) counts as none. */
export async function readModuleAppearance(database: Pick<Database, 'query'>): Promise<ModuleAppearances> {
  try { return await new AdminQueries(database).moduleAppearance(); } catch (error) {
    console.error('module_appearance_failed', (error as { code?: unknown }).code ?? 'UNKNOWN');
    return {};
  }
}

/** The modules with any chosen icon swapped in; an entry with no choice is returned as it is. */
export function withAppearance(modules: readonly ModuleEntry[], appearance: ModuleAppearances): ModuleEntry[] {
  return modules.map((entry) => { const icon = appearance[entry.code]?.icon; return icon && icon !== entry.icon ? { ...entry, icon } : entry; });
}

/**
 * `[data-module="<code>"]:not([data-default-accent]){--accent:<colour>}` for each chosen colour, for a <style> in the signed-in
 * layout. The derived shades follow `--accent` (styles.css). `data-default-accent` lets the สีและไอคอน popup still show the
 * default colour. Code and colour are checked again here, so only a palette colour can ever reach the CSS.
 */
export function appearanceCss(appearance: ModuleAppearances): string {
  return Object.entries(appearance).flatMap(([code, { color }]) => {
    const accent = moduleAccentSchema.safeParse(color);
    return accent.success && moduleCodeSchema.safeParse(code).success ? [`[data-module="${code}"]:not([data-default-accent]){--accent:${accent.data}}`] : [];
  }).join('');
}
