import { describe, expect, it } from 'vitest';
import { emptyExistingMasterData, validateMasterData, type ExistingMasterData } from './master-data-validation';
import { nationalId } from './national-id-fixture';

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
      { row: 2, code: 'HOSP', name: 'โรงพยาบาลวาริชภูมิ', parentCode: null, existingOrganizationId: null, headEmployeeCode: null },
      { row: 3, code: 'NUR', name: 'กลุ่มการพยาบาล', parentCode: 'HOSP', existingOrganizationId: null, headEmployeeCode: null }
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

  it('numbers rows as the spreadsheet does when the file has blank lines', () => {
    expect(codes(validateMasterData({ organizations: 'code,name\n\nA,\n' }, emptyExistingMasterData, lookup))).toEqual(['organizations:3:name:REQUIRED']);
  });

  it('treats a manager who is new in this file as a change to the current assignment', () => {
    const existing: ExistingMasterData = {
      organizations: [{ id: 'org-hosp', code: 'HOSP', name: 'โรงพยาบาล', parentId: null }],
      people: [{ id: 'p1', employeeCode: 'E001', nationalIdLookup: lookup(director), displayName: 'ผอ.', positionTitle: null, employmentStatus: 'ACTIVE', assignment: { organizationId: 'org-hosp', managerPersonId: null, effectiveFrom: new Date('2026-09-30T17:00:00Z') } }]
    };
    const result = validateMasterData({ people: people(`E001,${director},ผอ.,,HOSP,E002,2026-09-01,`, `E002,${nurse},หัวหน้าใหม่,,HOSP,,2026-09-01,`) }, existing, lookup);

    expect(codes(result)).toEqual(['people:2:effective_from:EFFECTIVE_DATE_NOT_AFTER_CURRENT']);
    expect(validateMasterData({ people: people(`E001,${director},ผอ.,,HOSP,E002,2026-11-01,`, `E002,${nurse},หัวหน้าใหม่,,HOSP,,2026-11-01,`) }, existing, lookup).people.map((row) => row.assignmentChanged)).toEqual([true, true]);
    expect(validateMasterData({ people: people(`E001,${director},ผอ.,,HOSP,,2026-11-01,`) }, existing, lookup).people.map((row) => row.assignmentChanged)).toEqual([false]);
  });

  it('limits a file to 5,000 rows', () => {
    const rows = Array.from({ length: 5_001 }, (_, index) => `C${index},หน่วย ${index},`);
    expect(codes(validateMasterData({ organizations: organizations(...rows) }, emptyExistingMasterData, lookup))).toEqual(['organizations:-:-:TOO_MANY_ROWS']);
  });
  describe('unit type and head columns', () => {
    const header = 'code,name,parent_code,unit_type,head_employee_code';
    const withHeads = (...rows: string[]) => [header, ...rows].join('\n');

    it('reads Thai and English unit types and a head from the people file', () => {
      const result = validateMasterData({
        organizations: withHeads('HOSP,โรงพยาบาล,,HOSPITAL,E001', 'NUR,กลุ่มการพยาบาล,HOSP,กลุ่มงาน,', 'IPD,งานผู้ป่วยใน,NUR,,'),
        people: people(`E001,${director},นพ.สมชาย ใจดี,ผู้อำนวยการ,HOSP,,2026-10-01,ACTIVE`)
      }, emptyExistingMasterData, lookup);

      expect(result.errors).toEqual([]);
      expect(result.organizations.map(({ code, unitType, headEmployeeCode }) => ({ code, unitType, headEmployeeCode }))).toEqual([
        { code: 'HOSP', unitType: 'HOSPITAL', headEmployeeCode: 'E001' },
        { code: 'NUR', unitType: 'DIVISION', headEmployeeCode: null },
        { code: 'IPD', unitType: undefined, headEmployeeCode: null }
      ]);
    });

    it('accepts a head who is already stored', () => {
      const existing: ExistingMasterData = { organizations: [], people: [{ id: 'p1', employeeCode: 'E001', nationalIdLookup: lookup(director), displayName: 'ผอ.', positionTitle: null, employmentStatus: 'ACTIVE', assignment: null }] };

      expect(validateMasterData({ organizations: withHeads('HOSP,โรงพยาบาล,,โรงพยาบาล,E001') }, existing, lookup).errors).toEqual([]);
    });

    it('reports an unknown unit type, an unknown head and an inactive head', () => {
      const result = validateMasterData({
        organizations: withHeads('HOSP,โรงพยาบาล,,ฝ่าย,', 'NUR,กลุ่มการพยาบาล,HOSP,DIVISION,E404', 'IPD,งานผู้ป่วยใน,NUR,SECTION,E002'),
        people: people(`E002,${nurse},มาลี,พยาบาล,IPD,,2026-10-01,INACTIVE`)
      }, emptyExistingMasterData, lookup);

      expect(codes(result)).toEqual([
        'organizations:2:unit_type:UNKNOWN_UNIT_TYPE',
        'organizations:3:head_employee_code:UNKNOWN_HEAD',
        'organizations:4:head_employee_code:INACTIVE_HEAD'
      ]);
    });

    it('reports a new head for a unit whose next head is already scheduled', () => {
      const existing: ExistingMasterData = {
        organizations: [{ id: 'org-hosp', code: 'HOSP', name: 'โรงพยาบาล', parentId: null, headPersonId: 'p2', headEffectiveFrom: new Date('2027-01-01T00:00:00Z') }],
        people: [
          { id: 'p1', employeeCode: 'E001', nationalIdLookup: lookup(director), displayName: 'ผอ.', positionTitle: null, employmentStatus: 'ACTIVE', assignment: null },
          { id: 'p2', employeeCode: 'E002', nationalIdLookup: lookup(nurse), displayName: 'คนถัดไป', positionTitle: null, employmentStatus: 'ACTIVE', assignment: null }
        ]
      };
      const now = new Date('2026-10-22T00:00:00Z');

      expect(codes(validateMasterData({ organizations: withHeads('HOSP,โรงพยาบาล,,,E001') }, existing, lookup, now))).toEqual(['organizations:2:head_employee_code:HEAD_ALREADY_SCHEDULED']);
      expect(validateMasterData({ organizations: withHeads('HOSP,โรงพยาบาล,,,E002') }, existing, lookup, now).errors).toEqual([]);
    });

    it('leaves unit type and head untouched for the original three-column file', () => {
      const result = validateMasterData({ organizations: organizations('HOSP,โรงพยาบาล,') }, emptyExistingMasterData, lookup);

      expect(result.organizations[0]).toMatchObject({ unitType: undefined, headEmployeeCode: null });
    });
  });

  describe('staff profile columns', () => {
    const profileHeader = `${peopleHeader},name_prefix,first_name,last_name,gender,birth_date,employment_type,appointed_on,position_level`;
    const base = `E001,${director},นพ.สมชาย ใจดี,ผู้อำนวยการ,HOSP,,2026-10-01,ACTIVE`;
    const types = [
      { id: 'type-civil', code: 'CIVIL_SERVANT', name: 'ข้าราชการ', isActive: true, sortOrder: 1 },
      { id: 'type-old', code: 'OLD_TYPE', name: 'ประเภทเลิกใช้', isActive: false, sortOrder: 9 }
    ];
    const run = (profileCells: string, existing: ExistingMasterData = emptyExistingMasterData) => validateMasterData({ organizations: organizations('HOSP,โรงพยาบาล,'), people: [profileHeader, `${base},${profileCells}`].join('\n') }, existing, lookup, new Date(), types);

    it('reads the profile columns, derives gender from the prefix and matches a type by name or code', () => {
      const byName = run('นพ.,สมชาย,ใจดี,,17/5/2533,ข้าราชการ,2015-04-01,ชำนาญการพิเศษ');
      expect(byName.errors).toEqual([]);
      expect(byName.people[0]!.profile).toEqual({ namePrefix: 'นพ.', firstName: 'สมชาย', lastName: 'ใจดี', gender: 'MALE', birthDate: '1990-05-17', employmentTypeId: 'type-civil', appointedOn: '2015-04-01', positionLevel: 'ชำนาญการพิเศษ' });
      expect(byName.people[0]!.profileChanged).toBe(true);
      expect(run(',,,หญิง,,CIVIL_SERVANT,,').people[0]!.profile).toEqual({ gender: 'FEMALE', employmentTypeId: 'type-civil' });
    });

    it('treats empty profile cells as keep and an absent column the same way', () => {
      const result = validateMasterData({ organizations: organizations('HOSP,โรงพยาบาล,'), people: people(base) }, emptyExistingMasterData, lookup, new Date(), types);
      expect(result.people[0]!.profile).toEqual({});
      expect(result.people[0]!.profileChanged).toBe(false);
    });

    it('reports each bad profile cell by row and column without its value', () => {
      expect(codes(run('ดร.,,,,,,,'))).toEqual(['people:2:gender:GENDER_REQUIRED']);
      expect(codes(run(',,,อื่น,,,,'))).toEqual(['people:2:gender:INVALID_GENDER']);
      expect(codes(run(',,,,30/2/2533,ลูกจ้างอวกาศ,2026-13-01,'))).toEqual(['people:2:birth_date:INVALID_DATE', 'people:2:appointed_on:INVALID_DATE', 'people:2:employment_type:UNKNOWN_EMPLOYMENT_TYPE']);
      expect(codes(run(',,,,,ประเภทเลิกใช้,,'))).toEqual(['people:2:employment_type:INACTIVE_EMPLOYMENT_TYPE']);
      expect(codes(run(`${'ก'.repeat(33)},,,ชาย,,,,`))).toEqual(['people:2:name_prefix:TOO_LONG']);
      expect(JSON.stringify(run(',,,,30/2/2533,ลูกจ้างอวกาศ,,').errors)).not.toContain('ลูกจ้างอวกาศ');
    });

    it('compares against the stored profile, keeps a retired type a person already has, and keeps a stored gender for an unclear prefix', () => {
      const existing: ExistingMasterData = { organizations: [{ id: 'org-hosp', code: 'HOSP', name: 'โรงพยาบาล', parentId: null }], people: [{ id: 'person-1', employeeCode: 'E001', nationalIdLookup: lookup(director), displayName: 'นพ.สมชาย ใจดี', positionTitle: 'ผู้อำนวยการ', employmentStatus: 'ACTIVE', assignment: { organizationId: 'org-hosp', managerPersonId: null, effectiveFrom: new Date('2026-01-01T00:00:00Z') }, profile: { namePrefix: 'นพ.', firstName: 'สมชาย', lastName: 'ใจดี', gender: 'MALE', birthDate: '1990-05-17', employmentTypeId: 'type-old', appointedOn: null, positionLevel: null } }] };
      const same = run('นพ.,สมชาย,ใจดี,,1990-05-17,ประเภทเลิกใช้,,', existing);
      expect(same.errors).toEqual([]);
      expect(same.people[0]!.profileChanged).toBe(false);
      const unclear = run('ดร.,,,,,,,', existing);
      expect(unclear.errors).toEqual([]);
      expect(unclear.people[0]!.profile.gender).toBe('MALE');
      expect(unclear.people[0]!.profileChanged).toBe(true);
    });
  });
});
