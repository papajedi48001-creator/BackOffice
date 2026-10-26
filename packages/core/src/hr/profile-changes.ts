import { genderForPrefix, type Gender } from '@backoffice/contracts';
import type { WorkChanges } from './profile-service';

type Values = Record<string, string | null>;

/** Which given fields differ from the stored ones. Only work fields keep their values; personal values never leave the profile table. */
export function diffProfile(before: Values, after: Partial<Record<string, string | null | undefined>>, workFields: readonly string[]): { changedFields: string[]; workChanges: WorkChanges } {
  const changedFields: string[] = [];
  const workChanges: WorkChanges = {};
  for (const [field, value] of Object.entries(after)) {
    if (value === undefined || value === (before[field] ?? null)) continue;
    changedFields.push(field);
    if (workFields.includes(field)) workChanges[field] = { from: before[field] ?? null, to: value };
  }
  return { changedFields, workChanges };
}

/**
 * The gender to store. `prefix` and `given` are undefined when the save leaves them out.
 * A given gender wins; otherwise a known prefix decides; otherwise the stored gender stays, and a prefix that does not tell needs one.
 */
export function resolveGender(prefix: string | null | undefined, given: Gender | null | undefined, stored: Gender | null): Gender | null | 'GENDER_REQUIRED' {
  if (given !== undefined) return given;
  if (prefix === undefined || prefix === null) return stored;
  return genderForPrefix(prefix) ?? stored ?? 'GENDER_REQUIRED';
}
