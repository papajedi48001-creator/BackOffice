import { describe, expect, it } from 'vitest';
import { resolveCommandChain, type ChainUnit } from './command-chain';

function units(overrides: Partial<Record<'S' | 'D' | 'H', Partial<ChainUnit>>> = {}): Map<string, ChainUnit> {
  const base: ChainUnit[] = [
    { id: 'S', parentId: 'D', unitType: 'SECTION', head: { personId: 's-head', active: true } },
    { id: 'D', parentId: 'H', unitType: 'DIVISION', head: { personId: 'd-head', active: true } },
    { id: 'H', parentId: null, unitType: 'HOSPITAL', head: { personId: 'director', active: true } }
  ];
  return new Map(base.map((unit) => [unit.id, { ...unit, ...overrides[unit.id as 'S' | 'D' | 'H'] }]));
}

const resolve = (target: Parameters<typeof resolveCommandChain>[0]['target'], unitMap = units(), requestorPersonId = 'nurse', organizationId = 'S') =>
  resolveCommandChain({ units: unitMap, organizationId, requestorPersonId, target });

describe('resolveCommandChain', () => {
  it('walks section to division', () => {
    expect(resolve('DIVISION')).toEqual({ approvers: [{ personId: 's-head', organizationId: 'S' }, { personId: 'd-head', organizationId: 'D' }], skippedOrganizationIds: [], reachedTarget: true });
  });

  it('walks to the hospital', () => {
    expect(resolve('HOSPITAL').approvers.map((approver) => approver.personId)).toEqual(['s-head', 'd-head', 'director']);
  });

  it('nearest head stops after one approver', () => {
    expect(resolve('NEAREST_HEAD').approvers).toEqual([{ personId: 's-head', organizationId: 'S' }]);
  });

  it('skips the requester when they head their own unit', () => {
    expect(resolve('DIVISION', units(), 's-head')).toEqual({ approvers: [{ personId: 'd-head', organizationId: 'D' }], skippedOrganizationIds: [], reachedTarget: true });
    expect(resolve('NEAREST_HEAD', units(), 's-head').approvers).toEqual([{ personId: 'd-head', organizationId: 'D' }]);
  });

  it('skips and reports a unit without a head', () => {
    expect(resolve('HOSPITAL', units({ D: { head: null } }))).toEqual({ approvers: [{ personId: 's-head', organizationId: 'S' }, { personId: 'director', organizationId: 'H' }], skippedOrganizationIds: ['D'], reachedTarget: true });
  });

  it('treats an inactive head as missing', () => {
    expect(resolve('HOSPITAL', units({ D: { head: { personId: 'd-head', active: false } } }))).toEqual({ approvers: [{ personId: 's-head', organizationId: 'S' }, { personId: 'director', organizationId: 'H' }], skippedOrganizationIds: ['D'], reachedTarget: true });
  });

  it('lists a person heading two levels once', () => {
    expect(resolve('HOSPITAL', units({ D: { head: { personId: 's-head', active: true } } })).approvers).toEqual([{ personId: 's-head', organizationId: 'S' }, { personId: 'director', organizationId: 'H' }]);
  });

  it('reports a chain that never meets the target', () => {
    expect(resolve('HOSPITAL', units({ H: { unitType: null } }))).toEqual({ approvers: [{ personId: 's-head', organizationId: 'S' }, { personId: 'd-head', organizationId: 'D' }, { personId: 'director', organizationId: 'H' }], skippedOrganizationIds: [], reachedTarget: false });
  });

  it('stops on a parent cycle', () => {
    const result = resolve('HOSPITAL', units({ H: { parentId: 'S', unitType: null } }));
    expect(result.approvers.map((approver) => approver.personId)).toEqual(['s-head', 'd-head', 'director']);
    expect(result.reachedTarget).toBe(false);
  });

  it('stops at a missing parent', () => {
    expect(resolve('HOSPITAL', units({ S: { parentId: 'gone' } }))).toEqual({ approvers: [{ personId: 's-head', organizationId: 'S' }], skippedOrganizationIds: [], reachedTarget: false });
  });

  it('returns an empty chain for an unknown organization', () => {
    expect(resolve('DIVISION', units(), 'nurse', 'unknown')).toEqual({ approvers: [], skippedOrganizationIds: [], reachedTarget: false });
  });
});
