/** เลขป้าย of a ผู้ป่วยในเหตุ: `MCI-` and the sequence, at least three digits. */
export function formatTag(sequence: number): string {
  return `MCI-${String(sequence).padStart(3, '0')}`;
}

/** The name the กระดานสาธารณะ may show: first name and the first letter of the surname. `null` when no first name is known. */
export function publicName(firstName: string, lastName: string): string | null {
  const first = firstName.trim();
  if (!first) return null;
  const initial = Array.from(lastName.trim())[0];
  return initial ? `${first} ${initial}.` : first;
}

export interface TriageChoice { triageLevelId: string; statusId: string }

/**
 * สีดำ and สถานะเสียชีวิต always go together: choosing either sets the other. A casualty leaving the deceased status needs a
 * colour other than black (`TRIAGE_REQUIRED`), so the two counts on the board never disagree.
 */
export function reconcileDeceased(input: TriageChoice, previous: TriageChoice | null, ids: { deceasedTriageId: string; deceasedStatusId: string }): ({ ok: true } & TriageChoice) | { ok: false; code: 'TRIAGE_REQUIRED' } {
  const wasDeceased = previous?.statusId === ids.deceasedStatusId;
  if (input.statusId === ids.deceasedStatusId) return { ok: true, triageLevelId: ids.deceasedTriageId, statusId: ids.deceasedStatusId };
  if (input.triageLevelId === ids.deceasedTriageId) {
    if (wasDeceased) return { ok: false, code: 'TRIAGE_REQUIRED' };
    return { ok: true, triageLevelId: ids.deceasedTriageId, statusId: ids.deceasedStatusId };
  }
  return { ok: true, triageLevelId: input.triageLevelId, statusId: input.statusId };
}

/** กฎจัดคน: the zone a newly checked-in person goes to, or `null` (รอจัดจุด) when there is no rule or its zone is switched off. */
export function defaultZoneFor(professionId: string, rules: ReadonlyArray<{ professionId: string; zoneId: string | null }>, activeZoneIds: ReadonlySet<string>): string | null {
  const zoneId = rules.find((rule) => rule.professionId === professionId)?.zoneId ?? null;
  return zoneId && activeZoneIds.has(zoneId) ? zoneId : null;
}
