import { describe, expect, it } from 'vitest';
import { DatabaseApproverResolver } from './database-approver-resolver';

type Row = Record<string, unknown>;

function fakeDatabase(units: Row[], managerRows: Row[]) {
  const queries: string[] = [];
  return {
    queries,
    query: async <T extends object>(sql: string) => {
      queries.push(sql);
      return (sql.includes('hr_organization_head') ? units : managerRows) as T[];
    }
  };
}

const section = { id: 'S', parentId: 'D', unitType: 'SECTION', headPersonId: 's-head', headStatus: 'ACTIVE' };
const division = { id: 'D', parentId: null, unitType: 'DIVISION', headPersonId: 'd-head', headStatus: 'ACTIVE' };
const input = { moduleCode: 'requests', requestorPersonId: 'nurse', organizationId: 'S' };

describe('DatabaseApproverResolver', () => {
  it('routes to the nearest head without reading the direct manager', async () => {
    const database = fakeDatabase([section, division], [{ personId: 'manager', organizationId: 'S' }]);

    await expect(new DatabaseApproverResolver(database).resolve(input)).resolves.toEqual([{ personId: 's-head', organizationId: 'S' }]);
    expect(database.queries.some((sql) => sql.includes('manager_person_id'))).toBe(false);
  });

  it('falls back to the direct manager while no unit has a head', async () => {
    const database = fakeDatabase([{ ...section, headPersonId: null, headStatus: null }, { ...division, headPersonId: null, headStatus: null }], [{ personId: 'manager', organizationId: 'S' }]);

    await expect(new DatabaseApproverResolver(database).resolve(input)).resolves.toEqual([{ personId: 'manager', organizationId: 'S' }]);
  });

  it('walks to the requested unit type', async () => {
    const database = fakeDatabase([section, division], []);

    await expect(new DatabaseApproverResolver(database).resolve({ ...input, target: 'DIVISION' })).resolves.toEqual([{ personId: 's-head', organizationId: 'S' }, { personId: 'd-head', organizationId: 'D' }]);
  });
});
