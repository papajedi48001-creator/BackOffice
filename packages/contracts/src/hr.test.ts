import { describe, expect, it } from 'vitest';
import { assignOrganizationHeadInputSchema, commandChainTargetSchema, organizationUnitTypeSchema, setOrganizationUnitTypeInputSchema } from './hr';

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
