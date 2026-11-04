/**
 * The rule for every คำขอ with a start and an end: picking the start sets the end to the same day, unless the person
 * already chose an end on or after the new start. Dates are ISO `YYYY-MM-DD`.
 */
export function endFollowingStart(start: string, end: string): string {
  return end && end >= start ? end : start;
}

/** The same rule for `YYYY-MM-DDTHH:mm` pairs (ขอใช้รถ): the return moves to the departure day and keeps its own time. */
export function returnFollowingDepart(depart: string, ret: string): string {
  const day = depart.slice(0, 10);
  if (ret && ret.slice(0, 10) >= day) return ret;
  return `${day}T${(ret || depart).slice(11, 16)}`;
}
