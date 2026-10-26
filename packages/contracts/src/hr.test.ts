import { describe, expect, it } from 'vitest';
import { assignOrganizationHeadInputSchema, calendarDateSchema, commandChainTargetSchema, employmentTypeInputSchema, genderForPrefix, organizationUnitTypeSchema, setOrganizationUnitTypeInputSchema, updatePersonContactInputSchema, updatePersonProfileInputSchema } from './hr';

describe('organization unit type and command chain contracts', () => {
  it('accepts the three unit types only', () => {
    expect(organizationUnitTypeSchema.parse('DIVISION')).toBe('DIVISION');
    expect(organizationUnitTypeSchema.safeParse('MISSION').success).toBe(false);
  });

  it('accepts a unit type or the nearest head as a chain target', () => {
    expect(commandChainTargetSchema.parse('NEAREST_HEAD')).toBe('NEAREST_HEAD');
    expect(commandChainTargetSchema.parse('HOSPITAL')).toBe('HOSPITAL');
    expect(commandChainTargetSchema.safeParse('FIRST').success).toBe(false);
  });

  it('coerces the head assignment date and allows clearing a unit type', () => {
    expect(assignOrganizationHeadInputSchema.parse({ organizationId: 'org-1', personId: 'person-1', effectiveFrom: '2026-10-21T17:00:00.000Z' }).effectiveFrom).toEqual(new Date('2026-10-21T17:00:00.000Z'));
    expect(setOrganizationUnitTypeInputSchema.parse({ organizationId: 'org-1', unitType: null }).unitType).toBeNull();
  });
});

describe('staff profile contracts', () => {
  it('derives gender from the known prefixes only', () => {
    expect(genderForPrefix('นพ.')).toBe('MALE');
    expect(genderForPrefix('นาย')).toBe('MALE');
    expect(genderForPrefix('นางสาว')).toBe('FEMALE');
    expect(genderForPrefix(' พญ. ')).toBe('FEMALE');
    expect(genderForPrefix('ดร.')).toBeNull();
    expect(genderForPrefix(null)).toBeNull();
  });

  it('accepts real calendar dates only', () => {
    expect(calendarDateSchema.safeParse('2026-02-28').success).toBe(true);
    expect(calendarDateSchema.safeParse('2024-02-29').success).toBe(true);
    expect(calendarDateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(calendarDateSchema.safeParse('2026-13-01').success).toBe(false);
    expect(calendarDateSchema.safeParse('28/02/2026').success).toBe(false);
  });

  it('accepts a partial profile update and an explicit gender override', () => {
    expect(updatePersonProfileInputSchema.parse({ namePrefix: 'นาง', gender: 'MALE' })).toEqual({ namePrefix: 'นาง', gender: 'MALE' });
    expect(updatePersonProfileInputSchema.parse({ birthDate: null }).birthDate).toBeNull();
    expect(updatePersonProfileInputSchema.safeParse({ gender: 'OTHER' }).success).toBe(false);
    expect(updatePersonProfileInputSchema.safeParse({ appointedOn: '2026-02-30' }).success).toBe(false);
    expect(updatePersonProfileInputSchema.safeParse({ organizationId: null }).success).toBe(false);
    expect(updatePersonProfileInputSchema.safeParse({ firstName: 'ก'.repeat(121) }).success).toBe(false);
  });

  it('checks contact phone numbers and lengths', () => {
    expect(updatePersonContactInputSchema.parse({ phone: '081-234 5678', address: null }).phone).toBe('081-234 5678');
    expect(updatePersonContactInputSchema.safeParse({ phone: '08x' }).success).toBe(false);
    expect(updatePersonContactInputSchema.safeParse({ emergencyContactPhone: '+66812345678' }).success).toBe(true);
    expect(updatePersonContactInputSchema.safeParse({ address: 'ก'.repeat(501) }).success).toBe(false);
  });

  it('checks employment type codes and names', () => {
    expect(employmentTypeInputSchema.parse({ code: 'DAILY_EMPLOYEE', name: 'ลูกจ้างรายวัน', isActive: true, sortOrder: 6 }).code).toBe('DAILY_EMPLOYEE');
    expect(employmentTypeInputSchema.safeParse({ code: 'daily', name: 'x', isActive: true, sortOrder: 1 }).success).toBe(false);
    expect(employmentTypeInputSchema.safeParse({ code: 'DAILY', name: '', isActive: true, sortOrder: 1 }).success).toBe(false);
  });
});
