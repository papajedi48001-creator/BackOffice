import { labMemberRoleSchema, labMovementKindSchema, labOpeningStatusSchema, labRequisitionStatusSchema } from '@backoffice/contracts';
import { describe, expect, it } from 'vitest';
import { labMovementKindLabel, labOpeningStatusLabel, labRequisitionStatusLabel, labRoleLabel } from './lab-labels';

describe('Lab labels', () => {
  it('has a Thai label for every enum value', () => {
    for (const value of labMemberRoleSchema.options) expect(labRoleLabel(value)).toMatch(/[ก-๙]/);
    for (const value of labMovementKindSchema.options) expect(labMovementKindLabel(value)).toMatch(/[ก-๙]/);
    for (const value of labRequisitionStatusSchema.options) expect(labRequisitionStatusLabel(value)).toMatch(/[ก-๙]/);
    for (const value of labOpeningStatusSchema.options) expect(labOpeningStatusLabel(value)).toMatch(/[ก-๙]/);
  });

  it('uses the spec role names', () => {
    expect(labRoleLabel('HEAD')).toBe('หัวหน้า Lab');
    expect(labRoleLabel('KEEPER')).toBe('ผู้ดูแลคลัง Lab');
    expect(labRoleLabel('STAFF')).toBe('เจ้าหน้าที่ Lab');
  });
});
