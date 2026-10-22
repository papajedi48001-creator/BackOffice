import type { ApproverSnapshot, CommandChainTarget, OrganizationUnitType } from '@backoffice/contracts';

export interface ChainUnit { id: string; parentId: string | null; unitType: OrganizationUnitType | null; head: { personId: string; active: boolean } | null; }
export interface CommandChain { approvers: ApproverSnapshot[]; skippedOrganizationIds: string[]; reachedTarget: boolean; }

export function resolveCommandChain(input: { units: ReadonlyMap<string, ChainUnit>; organizationId: string; requestorPersonId: string; target: CommandChainTarget }): CommandChain {
  const approvers: ApproverSnapshot[] = [];
  const skippedOrganizationIds: string[] = [];
  const visited = new Set<string>();
  let unit = input.units.get(input.organizationId);
  while (unit && !visited.has(unit.id)) {
    visited.add(unit.id);
    if (!unit.head?.active) skippedOrganizationIds.push(unit.id);
    // The requester never approves their own request, and someone heading two levels approves once.
    else if (unit.head.personId !== input.requestorPersonId && !approvers.some((approver) => approver.personId === unit!.head!.personId)) approvers.push({ personId: unit.head.personId, organizationId: unit.id });
    if (input.target === 'NEAREST_HEAD' ? approvers.length > 0 : unit.unitType === input.target) return { approvers, skippedOrganizationIds, reachedTarget: true };
    unit = unit.parentId ? input.units.get(unit.parentId) : undefined;
  }
  return { approvers, skippedOrganizationIds, reachedTarget: false };
}
