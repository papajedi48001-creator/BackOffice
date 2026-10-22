import { describe, expect, it } from 'vitest';
import { decideHeadAssignment } from './organization-head-service';

const current = { id: 'head-row-1', personId: 'person-a', effectiveFrom: new Date('2026-01-01T00:00:00Z') };
const base = { organizationExists: true, personStatus: 'ACTIVE' as const, current, personId: 'person-b', effectiveFrom: new Date('2026-06-01T00:00:00Z') };

describe('decideHeadAssignment', () => {
  it('rejects an unknown organization', () => {
    expect(decideHeadAssignment({ ...base, organizationExists: false })).toEqual({ kind: 'error', code: 'ORGANIZATION_NOT_FOUND' });
  });

  it('rejects a missing or inactive person', () => {
    expect(decideHeadAssignment({ ...base, personStatus: null })).toEqual({ kind: 'error', code: 'PERSON_NOT_ACTIVE' });
    expect(decideHeadAssignment({ ...base, personStatus: 'INACTIVE' })).toEqual({ kind: 'error', code: 'PERSON_NOT_ACTIVE' });
  });

  it('leaves the current head unchanged', () => {
    expect(decideHeadAssignment({ ...base, personId: 'person-a' })).toEqual({ kind: 'unchanged' });
  });

  it('rejects a start before the current term began', () => {
    expect(decideHeadAssignment({ ...base, effectiveFrom: new Date('2025-12-31T00:00:00Z') })).toEqual({ kind: 'error', code: 'EFFECTIVE_FROM_BEFORE_CURRENT' });
  });

  it('closes the current term when a new head starts', () => {
    expect(decideHeadAssignment(base)).toEqual({ kind: 'assign', closeCurrentId: 'head-row-1' });
  });

  it('opens a first term when the unit has no head', () => {
    expect(decideHeadAssignment({ ...base, current: null })).toEqual({ kind: 'assign', closeCurrentId: null });
  });
});
