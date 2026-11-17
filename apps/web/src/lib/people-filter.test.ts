import { describe, expect, it } from 'vitest';
import { NO_VALUE, filterPeople } from './people-filter';

const base = { employmentStatus: 'ACTIVE', nationalIdMasked: null, organizationCode: null };
const people = [
  { ...base, id: '1', employeeCode: 'RN001', displayName: 'นางมาลี ดีงาม', positionTitle: 'พยาบาลวิชาชีพ', employmentTypeName: 'ข้าราชการ', organizationName: 'กลุ่มการพยาบาล' },
  { ...base, id: '2', employeeCode: 'PT001', displayName: 'นายสมชาย ใจดี', positionTitle: 'นักกายภาพบำบัด', employmentTypeName: 'ลูกจ้างประจำ', organizationName: null },
];

describe('filterPeople', () => {
  it('matches a name or code, ignoring case and spaces around it', () => {
    expect(filterPeople(people, { query: ' rn001 ' }).map((p) => p.id)).toEqual(['1']);
    expect(filterPeople(people, { query: 'สมชาย' }).map((p) => p.id)).toEqual(['2']);
  });

  it('applies every chosen filter, and NO_VALUE picks people with none', () => {
    expect(filterPeople(people, { employmentTypeName: 'ข้าราชการ' }).map((p) => p.id)).toEqual(['1']);
    expect(filterPeople(people, { organizationName: NO_VALUE }).map((p) => p.id)).toEqual(['2']);
    expect(filterPeople(people, { positionTitle: 'พยาบาลวิชาชีพ', organizationName: NO_VALUE })).toEqual([]);
  });

  it('keeps everyone when nothing is chosen', () => {
    expect(filterPeople(people, {})).toHaveLength(2);
  });
});
