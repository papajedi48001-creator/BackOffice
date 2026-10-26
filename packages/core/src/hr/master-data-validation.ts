import type { EmploymentType, Gender, OrganizationUnitType } from '@backoffice/contracts';
import { resolveGender } from './profile-changes';
import { parseCsvRecords, type CsvRecord } from './csv';

export type MasterDataFile = 'organizations' | 'people';
export type MasterDataErrorCode =
  | 'INVALID_CSV' | 'MISSING_COLUMN' | 'TOO_MANY_ROWS' | 'REQUIRED' | 'TOO_LONG' | 'INVALID_NATIONAL_ID' | 'INVALID_DATE' | 'INVALID_STATUS'
  | 'DUPLICATE_CODE' | 'DUPLICATE_NATIONAL_ID' | 'NATIONAL_ID_CONFLICT' | 'UNKNOWN_ORGANIZATION' | 'UNKNOWN_MANAGER' | 'SELF_MANAGER'
  | 'PARENT_CYCLE' | 'EFFECTIVE_DATE_NOT_AFTER_CURRENT' | 'UNKNOWN_UNIT_TYPE' | 'UNKNOWN_HEAD' | 'INACTIVE_HEAD' | 'HEAD_ALREADY_SCHEDULED'
  | 'UNKNOWN_EMPLOYMENT_TYPE' | 'INACTIVE_EMPLOYMENT_TYPE' | 'INVALID_GENDER' | 'GENDER_REQUIRED';

/** A validation problem. It names the cell, never its value, so national IDs cannot leak through the report. */
export interface MasterDataError { file: MasterDataFile; row: number | null; column: string | null; code: MasterDataErrorCode; }
export interface MasterDataFiles { organizations?: string; people?: string; }
export type EmploymentStatus = 'ACTIVE' | 'INACTIVE';

export interface ExistingOrganization { id: string; code: string | null; name: string; parentId: string | null; unitType?: OrganizationUnitType | null; headPersonId?: string | null; headEffectiveFrom?: Date | null; }
export interface ExistingAssignment { organizationId: string; managerPersonId: string | null; effectiveFrom: Date; }
/** Profile fields the import can set. Dates are Bangkok calendar days as YYYY-MM-DD. */
export interface ImportProfile { namePrefix: string | null; firstName: string | null; lastName: string | null; gender: Gender | null; birthDate: string | null; employmentTypeId: string | null; appointedOn: string | null; positionLevel: string | null; }
export interface ExistingPerson { id: string; employeeCode: string | null; nationalIdLookup: string; displayName: string | null; positionTitle: string | null; employmentStatus: string; assignment: ExistingAssignment | null; profile?: ImportProfile | null; }
export interface ExistingMasterData { organizations: ExistingOrganization[]; people: ExistingPerson[]; }

export interface OrganizationImportRow {
  row: number; code: string; name: string; parentCode: string | null; existingOrganizationId: string | null;
  /** Undefined when the cell is empty or the column is absent, so the stored unit type is kept. */
  unitType?: OrganizationUnitType; headEmployeeCode: string | null;
}
export interface PersonImportRow {
  row: number; employeeCode: string; nationalId: string; displayName: string; positionTitle: string | null; organizationCode: string;
  managerEmployeeCode: string | null; effectiveFrom: Date; status: EmploymentStatus; existingPersonId: string | null;
  /** True when the import must start a new assignment: a new person, or a different unit or manager. */
  assignmentChanged: boolean;
  /** Only the profile fields the file fills; an empty cell keeps the stored value. */
  profile: Partial<ImportProfile>;
  profileChanged: boolean;
}
export interface MasterDataValidation { organizations: OrganizationImportRow[]; people: PersonImportRow[]; errors: MasterDataError[]; }

export const emptyExistingMasterData: ExistingMasterData = { organizations: [], people: [] };
export const maxImportRows = 5_000;

const organizationColumns = { required: ['code', 'name'], optional: ['parent_code', 'unit_type', 'head_employee_code'] };
const unitTypeByCell: Record<string, OrganizationUnitType> = { 'งาน': 'SECTION', 'กลุ่มงาน': 'DIVISION', 'โรงพยาบาล': 'HOSPITAL', section: 'SECTION', division: 'DIVISION', hospital: 'HOSPITAL' };
const peopleColumns = { required: ['employee_code', 'national_id', 'display_name', 'organization_code', 'effective_from'], optional: ['position_title', 'manager_employee_code', 'status', 'name_prefix', 'first_name', 'last_name', 'gender', 'birth_date', 'employment_type', 'appointed_on', 'position_level'] };
const genderByCell: Record<string, Gender> = { 'ชาย': 'MALE', 'หญิง': 'FEMALE', male: 'MALE', female: 'FEMALE' };
const emptyProfile: ImportProfile = { namePrefix: null, firstName: null, lastName: null, gender: null, birthDate: null, employmentTypeId: null, appointedOn: null, positionLevel: null };
const codeLength = 32;
const textLength = 255;
const bangkokOffsetMs = 7 * 60 * 60 * 1000;

type Cells = Record<string, string>;
interface Table { rows: { row: number; cells: Cells }[]; }

export function validateMasterData(files: MasterDataFiles, existing: ExistingMasterData, lookup: (nationalId: string) => string, now = new Date(), employmentTypes: readonly EmploymentType[] = []): MasterDataValidation {
  const errors: MasterDataError[] = [];
  const organizationTable = files.organizations === undefined ? null : readTable('organizations', files.organizations, organizationColumns.required, errors);
  const peopleTable = files.people === undefined ? null : readTable('people', files.people, peopleColumns.required, errors);
  // A head may be listed in the people file of the same import, and the file's status wins over the stored one.
  const headStatusByCode = new Map(existing.people.flatMap((person) => person.employeeCode ? [[person.employeeCode, person.employmentStatus] as const] : []));
  for (const { cells } of peopleTable?.rows ?? []) if (cells.employee_code) headStatusByCode.set(cells.employee_code, (cells.status || 'ACTIVE').toUpperCase());
  const organizations = organizationTable ? validateOrganizations(organizationTable, existing, headStatusByCode, now, errors) : [];
  const knownOrganizationCodes = new Set([...existing.organizations.flatMap((organization) => organization.code ? [organization.code] : []), ...organizationTable?.rows.map(({ cells }) => cells.code).filter(Boolean) ?? []]);
  const people = peopleTable ? validatePeople(peopleTable, existing, knownOrganizationCodes, organizations, lookup, employmentTypes, errors) : [];
  return { organizations, people, errors };
}

function readTable(file: MasterDataFile, text: string, requiredColumns: string[], errors: MasterDataError[]): Table | null {
  let records: CsvRecord[];
  try { records = parseCsvRecords(text); } catch { errors.push({ file, row: null, column: null, code: 'INVALID_CSV' }); return null; }
  const header = (records[0]?.cells ?? []).map((name) => name.trim().toLowerCase());
  const missing = requiredColumns.filter((column) => !header.includes(column));
  for (const column of missing) errors.push({ file, row: null, column, code: 'MISSING_COLUMN' });
  if (missing.length > 0) return null;
  if (records.length - 1 > maxImportRows) { errors.push({ file, row: null, column: null, code: 'TOO_MANY_ROWS' }); return null; }
  // Row numbers are the line each record starts on, so they match the spreadsheet even after blank lines.
  return { rows: records.slice(1).map((record) => ({ row: record.line, cells: Object.fromEntries(header.map((name, column) => [name, (record.cells[column] ?? '').trim()])) })) };
}

function validateOrganizations(table: Table, existing: ExistingMasterData, headStatusByCode: Map<string, string>, now: Date, errors: MasterDataError[]): OrganizationImportRow[] {
  const personIdByCode = new Map(existing.people.flatMap((person) => person.employeeCode ? [[person.employeeCode, person.id] as const] : []));
  const existingByCode = new Map(existing.organizations.flatMap((organization) => organization.code ? [[organization.code, organization] as const] : []));
  const codeById = new Map(existing.organizations.map((organization) => [organization.id, organization.code]));
  const fileCodes = new Set(table.rows.map(({ cells }) => cells.code).filter(Boolean));
  const parentByCode = new Map<string, string | null>(existing.organizations.flatMap((organization) => organization.code ? [[organization.code, organization.parentId ? codeById.get(organization.parentId) ?? null : null] as const] : []));
  for (const { cells } of table.rows) if (cells.code) parentByCode.set(cells.code, cells.parent_code || null);
  const seen = new Set<string>();
  const result: OrganizationImportRow[] = [];
  for (const { row, cells } of table.rows) {
    const rowErrors: MasterDataError[] = [];
    const fail = (column: string, code: MasterDataErrorCode) => rowErrors.push({ file: 'organizations', row, column, code });
    const { code, name } = cells;
    const parentCode = cells.parent_code || null;
    if (!code) fail('code', 'REQUIRED');
    else if (code.length > codeLength) fail('code', 'TOO_LONG');
    else if (seen.has(code)) fail('code', 'DUPLICATE_CODE');
    if (code) seen.add(code);
    if (!name) fail('name', 'REQUIRED');
    else if (name.length > textLength) fail('name', 'TOO_LONG');
    if (parentCode && !fileCodes.has(parentCode) && !existingByCode.has(parentCode)) fail('parent_code', 'UNKNOWN_ORGANIZATION');
    else if (parentCode && code && reachesAncestor(parentCode, code, parentByCode)) fail('parent_code', 'PARENT_CYCLE');
    const unitType = cells.unit_type ? unitTypeByCell[cells.unit_type.toLowerCase()] : undefined;
    if (cells.unit_type && !unitType) fail('unit_type', 'UNKNOWN_UNIT_TYPE');
    const headEmployeeCode = cells.head_employee_code || null;
    const headStatus = headEmployeeCode ? headStatusByCode.get(headEmployeeCode) : undefined;
    if (headEmployeeCode && !headStatus) fail('head_employee_code', 'UNKNOWN_HEAD');
    else if (headEmployeeCode && headStatus !== 'ACTIVE') fail('head_employee_code', 'INACTIVE_HEAD');
    else if (headEmployeeCode && code) {
      // An import starts a head term today, which cannot come before a term HR has already scheduled.
      const stored = existingByCode.get(code);
      if (stored?.headEffectiveFrom && stored.headEffectiveFrom > now && stored.headPersonId !== personIdByCode.get(headEmployeeCode)) fail('head_employee_code', 'HEAD_ALREADY_SCHEDULED');
    }
    errors.push(...rowErrors);
    if (rowErrors.length === 0) result.push({ row, code: code!, name: name!, parentCode, existingOrganizationId: existingByCode.get(code!)?.id ?? null, unitType, headEmployeeCode });
  }
  return result;
}

function reachesAncestor(start: string, target: string, parentByCode: Map<string, string | null>): boolean {
  let current: string | null | undefined = start;
  for (let steps = 0; current && steps <= parentByCode.size; steps += 1) {
    if (current === target) return true;
    current = parentByCode.get(current);
  }
  return false;
}

function validatePeople(table: Table, existing: ExistingMasterData, knownOrganizationCodes: Set<string>, organizations: OrganizationImportRow[], lookup: (nationalId: string) => string, employmentTypes: readonly EmploymentType[], errors: MasterDataError[]): PersonImportRow[] {
  const existingByCode = new Map(existing.people.flatMap((person) => person.employeeCode ? [[person.employeeCode, person] as const] : []));
  const existingByLookup = new Map(existing.people.map((person) => [person.nationalIdLookup, person]));
  // Units and people created by this import get placeholder ids, which never equal a stored id, so moving to them always counts as a change.
  const organizationIdByCode = new Map(existing.organizations.flatMap((organization) => organization.code ? [[organization.code, organization.id] as const] : []));
  for (const organization of organizations) if (!organization.existingOrganizationId) organizationIdByCode.set(organization.code, `new:${organization.code}`);
  const fileCodes = new Set(table.rows.map(({ cells }) => cells.employee_code).filter(Boolean));
  const personIdByCode = new Map<string, string>();
  for (const [code, person] of existingByCode) personIdByCode.set(code, person.id);
  for (const { cells } of table.rows) {
    if (!cells.employee_code || existingByCode.has(cells.employee_code)) continue;
    const adopted = existingByLookup.get(safeLookup(cells.national_id, lookup) ?? '');
    personIdByCode.set(cells.employee_code, adopted && !adopted.employeeCode ? adopted.id : `new:${cells.employee_code}`);
  }
  const seenCodes = new Set<string>();
  const seenNationalIds = new Set<string>();
  const result: PersonImportRow[] = [];
  for (const { row, cells } of table.rows) {
    const rowErrors: MasterDataError[] = [];
    const fail = (column: string, code: MasterDataErrorCode) => rowErrors.push({ file: 'people', row, column, code });
    const employeeCode = cells.employee_code;
    if (!employeeCode) fail('employee_code', 'REQUIRED');
    else if (employeeCode.length > codeLength) fail('employee_code', 'TOO_LONG');
    else if (seenCodes.has(employeeCode)) fail('employee_code', 'DUPLICATE_CODE');
    if (employeeCode) seenCodes.add(employeeCode);
    const nationalId = (cells.national_id ?? '').replace(/[\s-]/g, '');
    if (!nationalId) fail('national_id', 'REQUIRED');
    else if (!isValidNationalId(nationalId)) fail('national_id', 'INVALID_NATIONAL_ID');
    else if (seenNationalIds.has(nationalId)) fail('national_id', 'DUPLICATE_NATIONAL_ID');
    if (isValidNationalId(nationalId)) seenNationalIds.add(nationalId);
    const displayName = cells.display_name;
    if (!displayName) fail('display_name', 'REQUIRED');
    else if (displayName.length > textLength) fail('display_name', 'TOO_LONG');
    const positionTitle = cells.position_title || null;
    if (positionTitle && positionTitle.length > textLength) fail('position_title', 'TOO_LONG');
    const effectiveFrom = cells.effective_from ? parseBangkokDate(cells.effective_from) : null;
    if (!cells.effective_from) fail('effective_from', 'REQUIRED');
    else if (!effectiveFrom) fail('effective_from', 'INVALID_DATE');
    const status = parseStatus(cells.status);
    if (!status) fail('status', 'INVALID_STATUS');
    const organizationCode = cells.organization_code;
    if (!organizationCode) fail('organization_code', 'REQUIRED');
    else if (!knownOrganizationCodes.has(organizationCode)) fail('organization_code', 'UNKNOWN_ORGANIZATION');
    const managerEmployeeCode = cells.manager_employee_code || null;
    if (managerEmployeeCode && managerEmployeeCode === employeeCode) fail('manager_employee_code', 'SELF_MANAGER');
    else if (managerEmployeeCode && !fileCodes.has(managerEmployeeCode) && !existingByCode.has(managerEmployeeCode)) fail('manager_employee_code', 'UNKNOWN_MANAGER');

    let existingPerson: ExistingPerson | undefined;
    if (employeeCode && isValidNationalId(nationalId)) {
      const nationalIdLookup = lookup(nationalId);
      const byCode = existingByCode.get(employeeCode);
      const byLookup = existingByLookup.get(nationalIdLookup);
      if ((byCode && byCode.nationalIdLookup !== nationalIdLookup) || (byLookup?.employeeCode && byLookup.employeeCode !== employeeCode)) fail('national_id', 'NATIONAL_ID_CONFLICT');
      else existingPerson = byCode ?? byLookup;
    }
    const current = existingPerson?.assignment;
    const assignmentChanged = !current || organizationIdByCode.get(organizationCode ?? '') !== current.organizationId || (managerEmployeeCode ? personIdByCode.get(managerEmployeeCode) ?? null : null) !== current.managerPersonId;
    if (current && assignmentChanged && effectiveFrom && effectiveFrom.getTime() <= current.effectiveFrom.getTime()) fail('effective_from', 'EFFECTIVE_DATE_NOT_AFTER_CURRENT');
    const profile = readProfile(cells, existingPerson?.profile ?? null, employmentTypes, fail);
    const storedProfile = existingPerson?.profile ?? emptyProfile;
    const profileChanged = (Object.keys(profile) as (keyof ImportProfile)[]).some((field) => profile[field] !== storedProfile[field]);
    errors.push(...rowErrors);
    if (rowErrors.length === 0) result.push({ row, employeeCode: employeeCode!, nationalId, displayName: displayName!, positionTitle, organizationCode: organizationCode!, managerEmployeeCode, effectiveFrom: effectiveFrom!, status: status!, existingPersonId: existingPerson?.id ?? null, assignmentChanged , profile, profileChanged });
  }
  return result;
}

function readProfile(cells: Cells, stored: ImportProfile | null, employmentTypes: readonly EmploymentType[], fail: (column: string, code: MasterDataErrorCode) => void): Partial<ImportProfile> {
  const profile: Partial<ImportProfile> = {};
  const text = (column: string, field: 'namePrefix' | 'firstName' | 'lastName' | 'positionLevel', max: number) => {
    const value = cells[column];
    if (!value) return;
    if (value.length > max) fail(column, 'TOO_LONG');
    else profile[field] = value;
  };
  text('name_prefix', 'namePrefix', 32);
  text('first_name', 'firstName', 120);
  text('last_name', 'lastName', 120);
  text('position_level', 'positionLevel', 120);
  for (const [column, field] of [['birth_date', 'birthDate'], ['appointed_on', 'appointedOn']] as const) {
    if (!cells[column]) continue;
    const day = parseBangkokDate(cells[column]);
    if (!day) fail(column, 'INVALID_DATE');
    else profile[field] = new Date(day.getTime() + bangkokOffsetMs).toISOString().slice(0, 10);
  }
  if (cells.employment_type) {
    const type = employmentTypes.find((candidate) => candidate.code === cells.employment_type || candidate.name === cells.employment_type);
    if (!type) fail('employment_type', 'UNKNOWN_EMPLOYMENT_TYPE');
    // A retired type stays valid for people who already have it, so re-importing an old file still passes.
    else if (!type.isActive && stored?.employmentTypeId !== type.id) fail('employment_type', 'INACTIVE_EMPLOYMENT_TYPE');
    else profile.employmentTypeId = type.id;
  }
  let given: Gender | undefined;
  if (cells.gender) {
    given = genderByCell[cells.gender.toLowerCase()];
    if (!given) { fail('gender', 'INVALID_GENDER'); return profile; }
  }
  if (given === undefined && profile.namePrefix === undefined) return profile;
  const gender = resolveGender(profile.namePrefix, given, stored?.gender ?? null);
  if (gender === 'GENDER_REQUIRED') fail('gender', 'GENDER_REQUIRED');
  else profile.gender = gender;
  return profile;
}

function safeLookup(value: string | undefined, lookup: (nationalId: string) => string): string | null {
  const nationalId = (value ?? '').replace(/[\s-]/g, '');
  return isValidNationalId(nationalId) ? lookup(nationalId) : null;
}

export function isValidNationalId(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (13 - index), 0);
  return (11 - (sum % 11)) % 10 === Number(value[12]);
}

function parseStatus(value: string | undefined): EmploymentStatus | null {
  const normalised = (value ?? '').toUpperCase();
  if (!normalised) return 'ACTIVE';
  return normalised === 'ACTIVE' || normalised === 'INACTIVE' ? normalised : null;
}

/** Accepts YYYY-MM-DD or D/M/YYYY; a year after 2400 is read as Buddhist era. Returns Bangkok midnight as a UTC instant. */
function parseBangkokDate(value: string): Date | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : dayFirst ? [Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1])] : [NaN, NaN, NaN];
  const gregorianYear = year > 2400 ? year - 543 : year;
  const utc = Date.UTC(gregorianYear, month - 1, day);
  const check = new Date(utc);
  if (Number.isNaN(utc) || check.getUTCFullYear() !== gregorianYear || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(utc - bangkokOffsetMs);
}
