import { randomUUID } from 'node:crypto';
import type { ApproverResolver } from '../workflow/request-service';
import type { Database } from '@backoffice/db';
import { CommandChainService } from '../hr/command-chain-service';

export const LEAVE_TYPE_IDS = { SICK: '00000000-0000-4000-9000-000000000001', PERSONAL: '00000000-0000-4000-9000-000000000002', VACATION: '00000000-0000-4000-9000-000000000003', MATERNITY: '00000000-0000-4000-9000-000000000004', PATERNITY: '00000000-0000-4000-9000-000000000005' } as const;
export const EMPLOYMENT_TYPE_IDS = { CIVIL_SERVANT: '00000000-0000-4000-8000-000000000001', GOVERNMENT_EMPLOYEE: '00000000-0000-4000-8000-000000000002' } as const;

/** Integration-test fixtures: a section under a division under a hospital, each with a head, and people filed in the section. */
export async function createLeaveOrganization(database: Database) {
  const ids = { hospital: randomUUID(), division: randomUUID(), section: randomUUID(), director: randomUUID(), divisionHead: randomUUID(), sectionHead: randomUUID() };
  await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, NULL, ?, UTC_TIMESTAMP())', [ids.hospital, `โรงพยาบาล ${ids.hospital}`, 'HOSPITAL']);
  await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [ids.division, `กลุ่มงาน ${ids.division}`, ids.hospital, 'DIVISION']);
  await database.execute('INSERT INTO organization (id, name, parent_id, unit_type, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [ids.section, `งาน ${ids.section}`, ids.division, 'SECTION']);
  for (const [organizationId, personId] of [[ids.hospital, ids.director], [ids.division, ids.divisionHead], [ids.section, ids.sectionHead]] as const) {
    await insertPerson(database, personId);
    await database.execute('INSERT INTO hr_organization_head (id, organization_id, person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, ?, NULL, UTC_TIMESTAMP())', [randomUUID(), organizationId, personId, '2020-01-01 00:00:00']);
  }
  return ids;
}

export async function insertPerson(database: Pick<Database, 'execute'>, personId: string, displayName = `บุคลากร ${personId.slice(0, 8)}`): Promise<void> {
  await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [personId, 'ciphertext', randomUUID(), displayName]);
}

export async function createLeavePerson(database: Database, organizationId: string | null, profile: { employmentTypeId?: string | null; appointedOn?: string | null; gender?: 'MALE' | 'FEMALE' | null } = {}): Promise<string> {
  const personId = randomUUID();
  await insertPerson(database, personId);
  if (organizationId) await database.execute('INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, NULL, ?, NULL, UTC_TIMESTAMP())', [randomUUID(), personId, organizationId, '2020-01-01 00:00:00']);
  await database.execute('INSERT INTO hr_person_profile (person_id, employment_type_id, appointed_on, gender, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [personId, profile.employmentTypeId === undefined ? EMPLOYMENT_TYPE_IDS.CIVIL_SERVANT : profile.employmentTypeId, profile.appointedOn === undefined ? '2020-01-01' : profile.appointedOn, profile.gender ?? null]);
  return personId;
}

/** The command chain without the direct-manager fallback the web app adds. */
export const commandChainResolver = (database: Pick<Database, 'query'>): ApproverResolver => ({
  resolve: async (input) => (await new CommandChainService(database).resolve({ requestorPersonId: input.requestorPersonId, organizationId: input.organizationId, target: input.target ?? 'NEAREST_HEAD' })).approvers
});
