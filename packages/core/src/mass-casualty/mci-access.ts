import type { AccessSubject, MciCommandRole } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

const authorization = new AuthorizationService();

/** ผู้บัญชาการเหตุ by system role: ผู้ดูแลระบบ or ผู้จัดการอุบัติเหตุหมู่ (`mci.command`). They open/close เหตุ and change settings. */
export function canCommandMci(subject: AccessSubject): boolean {
  return authorization.organizationScope(subject, 'mci.command') === 'all';
}

/** The person's current check-in in the open เหตุ; `null` when not checked in (or checked out). */
export type MciActor = { personId: string; commandRole: MciCommandRole; zoneId: string | null } | null;
export type MciAction = 'record' | 'editPatient' | 'manageResponder' | 'assignRole' | 'viewPatients';

/**
 * What a บทบาทสั่งการ may do in the open เหตุ (spec table). `commands` (a `mci.command` holder) acts as ผู้บัญชาการ even when
 * not checked in. `targetZoneId` is the zone of the casualty or responder acted on; a หัวหน้าจุด acts only inside their own zone.
 */
export function mciCan(actor: MciActor, commands: boolean, action: MciAction, targetZoneId?: string | null): boolean {
  const role: MciCommandRole | null = commands ? 'COMMANDER' : actor?.commandRole ?? null;
  if (role === 'COMMANDER') return true;
  if (role === 'ZONE_LEAD') {
    if (action === 'viewPatients') return true;
    if (action === 'assignRole') return false;
    return Boolean(actor?.zoneId) && targetZoneId === actor?.zoneId;
  }
  if (role === 'RECORDER') return action === 'record' || action === 'editPatient' || action === 'viewPatients';
  return false;
}
