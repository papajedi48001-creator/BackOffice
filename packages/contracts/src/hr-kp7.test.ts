import { describe, expect, it } from 'vitest';
import { maritalStatusSchema, updatePersonFamilyInputSchema } from './hr';

describe('ก.พ.7 ข้อมูลส่วนตัวและครอบครัว', () => {
  it('takes the family fields, trimming text and allowing null to clear', () => {
    expect(updatePersonFamilyInputSchema.parse({ maritalStatus: 'MARRIED', religion: ' พุทธ ', birthplace: null, fatherName: 'นายสมชาย ใจดี', motherName: 'นางสมศรี ใจดี', motherMaidenName: 'รักไทย', spouseName: 'นางสาวมาลี ดีงาม', spouseMaidenName: 'ดีงาม', childrenCount: 2 }))
      .toEqual({ maritalStatus: 'MARRIED', religion: 'พุทธ', birthplace: null, fatherName: 'นายสมชาย ใจดี', motherName: 'นางสมศรี ใจดี', motherMaidenName: 'รักไทย', spouseName: 'นางสาวมาลี ดีงาม', spouseMaidenName: 'ดีงาม', childrenCount: 2 });
    expect(maritalStatusSchema.options).toEqual(['SINGLE', 'MARRIED', 'DIVORCED', 'SEPARATED', 'WIDOWED']);
  });

  it('refuses an unknown marital status, a child count outside 0 to 30, and fields that are not on the form', () => {
    expect(updatePersonFamilyInputSchema.safeParse({ maritalStatus: 'ENGAGED' }).success).toBe(false);
    expect(updatePersonFamilyInputSchema.safeParse({ childrenCount: 31 }).success).toBe(false);
    expect(updatePersonFamilyInputSchema.safeParse({ childrenCount: 1.5 }).success).toBe(false);
    expect(updatePersonFamilyInputSchema.safeParse({ childrenCount: -1 }).success).toBe(false);
    expect(updatePersonFamilyInputSchema.safeParse({ salary: 1 }).success).toBe(false);
  });
});
