import type { DirectoryPerson } from '@backoffice/core';

/** A filter value that picks people with nothing set in that field (shown as ยังไม่ระบุ). */
export const NO_VALUE = '__none__';
export const peopleFilterFields = ['positionTitle', 'employmentTypeName', 'organizationName'] as const;
export type PeopleFilterField = typeof peopleFilterFields[number];
export type PeopleCriteria = { query?: string } & Partial<Record<PeopleFilterField, string>>;

/** The name/code search and filters of ทะเบียนบุคลากร. The page and the export use this same function, so the file matches the screen. */
export function filterPeople<T extends Pick<DirectoryPerson, 'displayName' | 'employeeCode' | PeopleFilterField>>(people: ReadonlyArray<T>, criteria: PeopleCriteria): T[] {
  const needle = (criteria.query ?? '').trim().toLocaleLowerCase('th');
  return people.filter((person) =>
    (needle === '' || [person.displayName, person.employeeCode].some((value) => value?.toLocaleLowerCase('th').includes(needle)))
    && peopleFilterFields.every((field) => {
      const chosen = criteria[field] ?? '';
      return chosen === '' || (chosen === NO_VALUE ? person[field] === null : person[field] === chosen);
    }));
}
