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
 * The gender to store. `prefix` and `given` are undefined when the save leaves them out; a null `given` is the form's blank choice.
 * A given gender wins. Otherwise a stored gender stays while the prefix is unchanged, so HR's override survives a re-save or re-import.
 * Otherwise a known prefix decides, and a prefix that does not tell needs a gender.
 */
export function resolveGender(prefix: string | null | undefined, given: Gender | null | undefined, stored: { namePrefix: string | null; gender: Gender | null }): Gender | null | 'GENDER_REQUIRED' {
  if (given) return given;
  const effectivePrefix = prefix === undefined ? stored.namePrefix : prefix;
  if (given === null) return genderForPrefix(effectivePrefix) ?? (effectivePrefix === null ? null : 'GENDER_REQUIRED');
  const prefixChanged = prefix !== undefined && prefix !== stored.namePrefix;
  if ((!prefixChanged && stored.gender) || effectivePrefix === null) return stored.gender;
  return genderForPrefix(effectivePrefix) ?? stored.gender ?? 'GENDER_REQUIRED';
}
