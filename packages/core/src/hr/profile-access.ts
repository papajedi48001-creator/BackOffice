import type { AccessSubject, Permission } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';

export interface ProfileAccess { viewWork: boolean; viewPrivate: boolean; editProfile: boolean; editContact: boolean; }

const authorization = new AuthorizationService();

/** What a viewer may see and change on one person's profile. The person always sees their own and edits their own contact details. */
export function profileAccess(subject: AccessSubject, target: { personId: string; organizationId: string | null }): ProfileAccess {
  if (!subject.authenticated || !subject.personId) return { viewWork: false, viewPrivate: false, editProfile: false, editContact: false };
  const self = subject.personId === target.personId;
  const covers = (permission: Permission) => {
    const scope = authorization.organizationScope(subject, permission);
    return scope === 'all' || (target.organizationId !== null && scope.includes(target.organizationId));
  };
  const ownsHrData = subject.dataOwnerModules.includes('hr');
  const editProfile = covers('hr.person.manage') && ownsHrData;
  return {
    viewWork: self || covers('hr.person.read'),
    viewPrivate: self || (covers('hr.person.private.read') && ownsHrData),
    editProfile,
    editContact: self || editProfile
  };
}

export function canManageEmploymentTypes(subject: AccessSubject): boolean {
  return authorization.canActHospitalWide(subject, 'hr.person.manage', 'hr');
}
