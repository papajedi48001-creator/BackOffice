import { randomUUID } from 'node:crypto';
import type { OrganizationUnitType } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { NationalIdProtector } from '../crypto/national-id';
import { validateMasterData, type ExistingMasterData, type ExistingOrganization, type MasterDataError, type MasterDataFiles, type MasterDataValidation, type OrganizationImportRow } from './master-data-validation';
import { OrganizationHeadService } from './organization-head-service';

export interface MasterDataImportSummary { organizationsCreated: number; organizationsUpdated: number; peopleCreated: number; peopleUpdated: number; assignmentsChanged: number; headsChanged: number; }
export type MasterDataImportResult = { ok: true; summary: MasterDataImportSummary } | { ok: false; errors: MasterDataError[] };

type QueryDatabase = Pick<Database, 'execute' | 'query'>;
type StoredOrganization = { id: string; code: string | null; name: string; parentId: string | null; unitType: OrganizationUnitType | null; headPersonId: string | null };
type StoredPerson = { id: string; employeeCode: string | null; nationalIdLookup: string; displayName: string | null; positionTitle: string | null; employmentStatus: string; organizationId: string | null; managerPersonId: string | null; effectiveFrom: string | null };

interface Plan {
  summary: MasterDataImportSummary;
  organizationIdByCode: Map<string, string>;
  personIdByCode: Map<string, string>;
}

export class MasterDataImportService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly protector: NationalIdProtector, private readonly createId: () => string = randomUUID) {}

  async validate(files: MasterDataFiles): Promise<MasterDataImportResult> {
    const existing = await loadExistingMasterData(this.database);
    const validation = validateMasterData(files, existing, (value) => this.protector.lookup(value));
    if (validation.errors.length > 0) return { ok: false, errors: validation.errors };
    return { ok: true, summary: this.plan(validation, existing).summary };
  }

  async apply(files: MasterDataFiles, actorPersonId: string): Promise<MasterDataImportResult> {
    return this.database.transaction(async (database) => {
      // Locking reads hold the rows (and gaps) until commit, so a second import waits and then validates against this one's result.
      const existing = await loadExistingMasterData(database, { forUpdate: true });
      const validation = validateMasterData(files, existing, (value) => this.protector.lookup(value));
      if (validation.errors.length > 0) return { ok: false, errors: validation.errors };
      const plan = this.plan(validation, existing);
      await this.write(database, validation, existing, plan, actorPersonId);
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'hr.master_data.imported', targetType: 'hr_master_data', targetId: this.createId(), result: 'SUCCESS', metadata: { counts: plan.summary } });
      return { ok: true, summary: plan.summary };
    });
  }

  private plan(validation: MasterDataValidation, existing: ExistingMasterData): Plan {
    const summary: MasterDataImportSummary = { organizationsCreated: 0, organizationsUpdated: 0, peopleCreated: 0, peopleUpdated: 0, assignmentsChanged: 0, headsChanged: 0 };
    const organizationIdByCode = new Map(existing.organizations.flatMap((organization) => organization.code ? [[organization.code, organization.id] as const] : []));
    const organizationById = new Map(existing.organizations.map((organization) => [organization.id, organization]));
    for (const row of validation.organizations) {
      if (!row.existingOrganizationId) { organizationIdByCode.set(row.code, this.createId()); summary.organizationsCreated += 1; }
    }
    for (const row of validation.organizations) {
      const stored = row.existingOrganizationId ? organizationById.get(row.existingOrganizationId) : undefined;
      if (stored && (stored.name !== row.name || stored.parentId !== (row.parentCode ? organizationIdByCode.get(row.parentCode) ?? null : null) || unitTypeChanged(row, stored))) summary.organizationsUpdated += 1;
    }
    const personIdByCode = new Map(existing.people.flatMap((person) => person.employeeCode ? [[person.employeeCode, person.id] as const] : []));
    const personById = new Map(existing.people.map((person) => [person.id, person]));
    for (const row of validation.people) {
      if (row.existingPersonId) personIdByCode.set(row.employeeCode, row.existingPersonId);
      else { personIdByCode.set(row.employeeCode, this.createId()); summary.peopleCreated += 1; }
    }
    for (const row of validation.people) {
      const stored = row.existingPersonId ? personById.get(row.existingPersonId) : undefined;
      if (stored && (stored.employeeCode !== row.employeeCode || stored.displayName !== row.displayName || stored.positionTitle !== row.positionTitle || stored.employmentStatus !== row.status)) summary.peopleUpdated += 1;
      if (row.assignmentChanged) summary.assignmentsChanged += 1;
    }
    for (const row of validation.organizations) {
      const stored = row.existingOrganizationId ? organizationById.get(row.existingOrganizationId) : undefined;
      if (row.headEmployeeCode && personIdByCode.get(row.headEmployeeCode) !== (stored?.headPersonId ?? null)) summary.headsChanged += 1;
    }
    return { summary, organizationIdByCode, personIdByCode };
  }

  private async write(database: QueryDatabase, validation: MasterDataValidation, existing: ExistingMasterData, plan: Plan, actorPersonId: string): Promise<void> {
    const { organizationIdByCode, personIdByCode } = plan;
    const organizationById = new Map(existing.organizations.map((organization) => [organization.id, organization]));
    // Parents are set in a second pass so a file can list a unit before its parent.
    for (const row of validation.organizations) {
      if (!row.existingOrganizationId) await database.execute('INSERT INTO organization (id, code, name, parent_id, created_at) VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())', [organizationIdByCode.get(row.code)!, row.code, row.name]);
      else if (organizationById.get(row.existingOrganizationId)!.name !== row.name) await database.execute('UPDATE organization SET name = ? WHERE id = ?', [row.name, row.existingOrganizationId]);
    }
    for (const row of validation.organizations) {
      const id = organizationIdByCode.get(row.code)!;
      const parentId = row.parentCode ? organizationIdByCode.get(row.parentCode)! : null;
      if ((organizationById.get(id)?.parentId ?? null) !== parentId) await database.execute('UPDATE organization SET parent_id = ? WHERE id = ?', [parentId, id]);
      if (unitTypeChanged(row, organizationById.get(id))) await database.execute('UPDATE organization SET unit_type = ? WHERE id = ?', [row.unitType!, id]);
    }
    const personById = new Map(existing.people.map((person) => [person.id, person]));
    for (const row of validation.people) {
      const id = personIdByCode.get(row.employeeCode)!;
      const stored = personById.get(id);
      if (!stored) {
        await database.execute(
          'INSERT INTO person (id, employee_code, display_name, position_title, employment_status, national_id_ciphertext, national_id_lookup, national_id_masked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
          [id, row.employeeCode, row.displayName, row.positionTitle, row.status, this.protector.encrypt(row.nationalId), this.protector.lookup(row.nationalId), this.protector.mask(row.nationalId)]
        );
      } else if (stored.employeeCode !== row.employeeCode || stored.displayName !== row.displayName || stored.positionTitle !== row.positionTitle || stored.employmentStatus !== row.status) {
        await database.execute('UPDATE person SET employee_code = ?, display_name = ?, position_title = ?, employment_status = ?, national_id_masked = ? WHERE id = ?', [row.employeeCode, row.displayName, row.positionTitle, row.status, this.protector.mask(row.nationalId), id]);
      }
    }
    for (const row of validation.people) {
      const id = personIdByCode.get(row.employeeCode)!;
      const stored = personById.get(id);
      if (!row.assignmentChanged) continue;
      const effectiveFrom = toMariaDbDatetime(row.effectiveFrom);
      if (stored?.assignment) await database.execute('UPDATE employment_assignment SET effective_until = ? WHERE person_id = ? AND effective_until IS NULL', [effectiveFrom, id]);
      await database.execute(
        'INSERT INTO employment_assignment (id, person_id, organization_id, manager_person_id, effective_from, effective_until, created_at) VALUES (?, ?, ?, ?, ?, NULL, UTC_TIMESTAMP())',
        [this.createId(), id, organizationIdByCode.get(row.organizationCode)!, row.managerEmployeeCode ? personIdByCode.get(row.managerEmployeeCode)! : null, effectiveFrom]
      );
    }
    // Heads come last because a head may be a person this import creates.
    const heads = new OrganizationHeadService(this.database, this.createId);
    const now = new Date();
    for (const row of validation.organizations) {
      if (!row.headEmployeeCode) continue;
      const decision = await heads.assign({ organizationId: organizationIdByCode.get(row.code)!, personId: personIdByCode.get(row.headEmployeeCode)!, effectiveFrom: now }, actorPersonId, database);
      if (decision.kind === 'error') throw new Error(`HEAD_ASSIGNMENT_${decision.code}`);
    }
  }
}


export async function loadExistingMasterData(database: Pick<Database, 'query'>, options: { forUpdate?: boolean } = {}): Promise<ExistingMasterData> {
  const lock = options.forUpdate ? ' FOR UPDATE' : '';
  const organizations = await database.query<StoredOrganization>(`SELECT o.id, o.code, o.name, o.parent_id AS parentId, o.unit_type AS unitType, h.person_id AS headPersonId FROM organization o LEFT JOIN hr_organization_head h ON h.organization_id = o.id AND h.effective_until IS NULL${lock}`);
  // Timestamps are formatted in SQL so the driver's local time zone never shifts them.
  const people = await database.query<StoredPerson>(
    `SELECT p.id, p.employee_code AS employeeCode, p.national_id_lookup AS nationalIdLookup, p.display_name AS displayName, p.position_title AS positionTitle, p.employment_status AS employmentStatus,
       a.organization_id AS organizationId, a.manager_person_id AS managerPersonId, DATE_FORMAT(a.effective_from, '%Y-%m-%dT%H:%i:%sZ') AS effectiveFrom
     FROM person p LEFT JOIN employment_assignment a ON a.id = (SELECT latest.id FROM employment_assignment latest WHERE latest.person_id = p.id AND latest.effective_until IS NULL ORDER BY latest.effective_from DESC LIMIT 1)${lock}`
  );
  return {
    organizations,
    people: people.map(({ organizationId, managerPersonId, effectiveFrom, ...person }) => ({
      ...person,
      assignment: organizationId && effectiveFrom ? { organizationId, managerPersonId, effectiveFrom: new Date(effectiveFrom) } : null
    }))
  };
}

function toMariaDbDatetime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function unitTypeChanged(row: OrganizationImportRow, stored: StoredOrganization | ExistingOrganization | undefined): boolean {
  return row.unitType !== undefined && row.unitType !== (stored?.unitType ?? null);
}
