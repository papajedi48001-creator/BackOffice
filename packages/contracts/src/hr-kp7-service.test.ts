import { describe, expect, it } from 'vitest';
import { retirementDate, updateCivilServiceInputSchema, updateEducationInputSchema } from './hr';

describe('ก.พ.7 ข้อมูลการปฏิบัติราชการ', () => {
  it('takes the civil-service fields and refuses unknown ones or a negative salary', () => {
    expect(updateCivilServiceInputSchema.parse({ positionNumber: ' 100001 ', salary: 25000.5, parentAgency: 'สสจ.ทดสอบ', gpfStatus: 'MEMBER', firstAppointedOn: '2020-08-24', reappointedOn: null, transferredInOn: null, transferredOutOn: null, joinedUnitOn: '2020-08-24', currentLevelSince: '2020-08-24', qualification: 'ปริญญาตรี', qualificationMajor: 'คอมพิวเตอร์', specialAllowance: null }))
      .toMatchObject({ positionNumber: '100001', salary: 25000.5, gpfStatus: 'MEMBER' });
    expect(updateCivilServiceInputSchema.safeParse({ salary: -1 }).success).toBe(false);
    expect(updateCivilServiceInputSchema.safeParse({ gpfStatus: 'YES' }).success).toBe(false);
    expect(updateCivilServiceInputSchema.safeParse({ joinedUnitOn: '2020-02-30' }).success).toBe(false);
    expect(updateCivilServiceInputSchema.safeParse({ nickname: 'x' }).success).toBe(false);
  });

  it('retires on 1 ต.ค. of the fiscal year the person turns 60', () => {
    expect(retirementDate('1986-03-10')).toBe('2046-10-01');
    expect(retirementDate('1986-10-01')).toBe('2046-10-01');
    expect(retirementDate('1986-10-02')).toBe('2047-10-01');
    expect(retirementDate('1986-12-31')).toBe('2047-10-01');
    expect(retirementDate(null)).toBeNull();
  });
});

describe('ก.พ.7 ข้อมูลการศึกษา', () => {
  it('takes up to 20 degrees, each needing a วุฒิ', () => {
    expect(updateEducationInputSchema.parse({ entries: [{ graduatedOn: '2009-03-07', degree: ' วิทยาศาสตรบัณฑิต ', major: 'วิทยาการคอมพิวเตอร์', institution: 'มหาวิทยาลัยทดสอบ', country: null }] }).entries[0]!.degree).toBe('วิทยาศาสตรบัณฑิต');
    expect(updateEducationInputSchema.safeParse({ entries: [{ degree: '' }] }).success).toBe(false);
    expect(updateEducationInputSchema.safeParse({ entries: Array.from({ length: 21 }, () => ({ degree: 'ป.ตรี' })) }).success).toBe(false);
    expect(updateEducationInputSchema.parse({ entries: [] }).entries).toEqual([]);
  });
});
