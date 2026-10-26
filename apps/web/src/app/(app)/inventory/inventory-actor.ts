import type { AccessSubject, Permission } from '@backoffice/contracts';
import { notFound, redirect } from 'next/navigation';
import { pageActor } from '../../../lib/actor';
import { canInventory } from '../../../lib/inventory-access';

export function inventorySubject(actor: { personId: string; roles: AccessSubject['roles'] }): AccessSubject {
  return { authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] };
}

/** Server pages: send visitors to sign in, and answer 404 to people whose roles do not reach the page. */
export async function requireInventoryPage(...permissions: Permission[]) {
  const actor = await pageActor();
  if (!actor) redirect('/');
  const subject = inventorySubject(actor);
  if (!canInventory(subject, ...permissions)) notFound();
  return { actor, subject };
}
