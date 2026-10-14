import { describe, expect, it } from 'vitest';
import { emptyExistingMasterData, validateMasterData, type ExistingMasterData } from './master-data-validation';

/** Builds a valid Thai national ID from a 12-digit prefix. */
export function nationalId(prefix: string): string {
  const sum = [...prefix].reduce((total, digit, index) => total + Number(digit) * (13 - index), 0);
  return `${prefix}${(11 - (sum % 11)) % 10}`;
}

const lookup = (value: string) => `lookup:${value}`;
const organizationsHeader = 'code,name,parent_code';
const peopleHeader = 'employee_code,national_id,display_name,position_title,organization_code,manager_employee_code,effective_from,status';
const director = nationalId('110000000001');
const nurse = nationalId('110000000002');

function people(...rows: string[]) { return [peopleHeader, ...rows].join('\n'); }
function organizations(...rows: string[]) { return [organizationsHeader, ...rows].join('\n'); }
function codes(result: ReturnType<typeof validateMasterData>) { return result.errors.map((error) => `${error.file}:${error.row ?? '-'}:${error.column ?? '-'}:${error.code}`); }

describe('validateMasterData', () => {
  it('normalises valid organizations and people', () => {
    const result = validateMasterData({
      organizations: organizations('HOSP,โรงพยาบาลวาริชภูมิ,', 'NUR,กลุ่มการพยาบาล,HOSP'),
      people: people(`E001,${director},นพ.สมชาย ใจดี,ผู้อำนวยการ,HOSP,,2026-10-01,ACTIVE`, `E002,${nurse.slice(0, 1)}-${nurse.slice(1, 5)}-${nurse.slice(5, 10)}-${nurse.slice(10, 12)}-${nurse[12]},นางสาวมาลี ดีงาม,พยาบาลวิชาชีพ,NUR,E001,1/10/2569,`)
    }, emptyExistingMasterData, lookup);

    expect(result.errors).toEqual([]);
    expect(result.organizations).toEqual([
      { row: 2, code: 'HOSP', name: 'โรงพยาบาลวาริชภูมิ', parentCode: null, existingOrganizationId: null },
      { row: 3, code: 'NUR', name: 'กลุ่มการพยาบาล', parentCode: 'HOSP', existingOrganizationId: null }
    ]);
    expect(result.people[1]).toMatchObject({ row: 3, employeeCode: 'E002', nationalId: nurse, organizationCode: 'NUR', managerEmployeeCode: 'E001', status: 'ACTIVE' });
    // Dates are Bangkok calendar days; 1/10/2569 (Buddhist era, day first) is the same day as 2026-10-01.
    expect(result.people[0]!.effectiveFrom.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(result.people[1]!.effectiveFrom.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  it('reports missing columns once per file', () => {
    const result = validateMasterData({ organizations: 'code\nHOSP', people: 'employee_code,national_id\nE001,1' }, emptyExistingMasterData, lookup);
    expect(codes(result)).toEqual(['organizations:-:name:MISSING_COLUMN', 'people:-:display_name:MISSING_COLUMN', 'people:-:organization_code:MISSING_COLUMN', 'people:-:effective_from:MISSING_COLUMN']);
  });

  it('reports every invalid cell with its row and column but never the value', () => {
    const result = validateMasterData({
      organizations: organizations('HOSP,โรงพยาบาล,', 'HOSP,ซ้ำ,', `${'X'.repeat(33)},ยาว,`, 'LOOP,วน,LOOP', 'A,ก,MISSING'),
      people: people(
        `E001,${director},ผอ.,ผู้อำนวยการ,HOSP,,2026-10-01,ACTIVE`,
        `E001,${nurse},ซ้ำรหัส,พยาบาล,HOSP,,2026-10-01,ACTIVE`,
        `E003,${director},ซ้ำเลข,พยาบาล,HOSP,,2026-10-01,ACTIVE`,
        'E004,1234567890123,เลขผิด,พยาบาล,HOSP,,2026-10-01,ACTIVE',
        `E005,${nationalId('110000000005')},,พยาบาล,NOPE,E999,2026-13-01,RETIRED`,
        `E006,${nationalId('110000000006')},หัวหน้าตัวเอง,พยาบาล,HOSP,E006,2026-10-01,INACTIVE`
      )
    }, emptyExistingMasterData, lookup);

    expect(codes(result)).toEqual([
      'organizations:3:code:DUPLICATE_CODE',
      'organizations:4:code:TOO_LONG',
      'organizations:5:parent_code:PARENT_CYCLE',
      'organizations:6:parent_code:UNKNOWN_ORGANIZATION',
      'people:3:employee_code:DUPLICATE_CODE',
      'people:4:national_id:DUPLICATE_NATIONAL_ID',
      'people:5:national_id:INVALID_NATIONAL_ID',
      'people:6:display_name:REQUIRED',
      'people:6:effective_from:INVALID_DATE',
      'people:6:status:INVALID_STATUS',
      'people:6:organization_code:UNKNOWN_ORGANIZATION',
      'people:6:manager_employee_code:UNKNOWN_MANAGER',
      'people:7:manager_employee_code:SELF_MANAGER'
    ]);
    expect(JSON.stringify(result.errors)).not.toMatch(/\d{13}/);
  });

  it('checks references and identity against what is already stored', () => {
    const existing: ExistingMasterData = {
      organizations: [{ id: 'org-hosp', code: 'HOSP', name: 'โรงพยาบาล', parentId: null }, { id: 'org-nur', code: 'NUR', name: 'กลุ่มการพยาบาล', parentId: 'org-hosp' }],
      people: [
        { id: 'p1', employeeCode: 'E001', nationalIdLookup: lookup(director), displayName: 'ผอ.', positionTitle: 'ผู้อำนวยการ', employmentStatus: 'ACTIVE', assignment: { organizationId: 'org-hosp', managerPersonId: null, effectiveFrom: new Date('2026-09-30T17:00:00Z') } },
        { id: 'p2', employeeCode: null, nationalIdLookup: lookup(nurse), displayName: null, positionTitle: null, employmentStatus: 'ACTIVE', assignment: null },
        { id: 'p9', employeeCode: 'E009', nationalIdLookup: lookup(nationalId('110000000009')), displayName: 'เดิม', positionTitle: null, employmentStatus: 'ACTIVE', assignment: null }
      ]
    };
    const result = validateMasterData({
      organizations: organizations('HOSP,โรงพยาบาล,NUR'),
      people: people(
        `E001,${director},ผอ.,ผู้อำนวยการ,NUR,,2026-10-01,ACTIVE`,
        `E002,${nurse},มาลี,พยาบาล,NUR,E001,2026-10-01,ACTIVE`,
        `E003,${nationalId('110000000003')},ใหม่,พยาบาล,NUR,E001,2026-10-01,ACTIVE`,
        `E005,${nationalId('110000000009')},รหัสใหม่เลขเดิม,พยาบาล,NUR,,2026-10-01,ACTIVE`
      )
    }, existing, lookup);

    expect(codes(result)).toEqual([
      'organizations:2:parent_code:PARENT_CYCLE',
      'people:2:effective_from:EFFECTIVE_DATE_NOT_AFTER_CURRENT',
      'people:5:national_id:NATIONAL_ID_CONFLICT'
    ]);
    expect(result.people.map((person) => person.existingPersonId)).toEqual(['p2', null]);
  });

  it('limits a file to 5,000 rows', () => {
    const rows = Array.from({ length: 5_001 }, (_, index) => `C${index},หน่วย ${index},`);
    expect(codes(validateMasterData({ organizations: organizations(...rows) }, emptyExistingMasterData, lookup))).toEqual(['organizations:-:-:TOO_MANY_ROWS']);
  });
});
