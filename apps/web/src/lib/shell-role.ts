import type { Session } from '@backoffice/contracts';
import type { ShellRole } from '../components/profile-menu';
import { roleChoiceName } from './role-choice-labels';

/** The บทบาท shown in the profile menu: for anyone holding a tier, who may then switch (to บุคลากรทั่วไป at least). */
export function shellRole(session: Pick<Session, 'activeRole' | 'roleChoices'>): ShellRole | null {
  const held = session.roleChoices?.length ?? 0;
  return session.activeRole && held > 0 ? { name: roleChoiceName(session.activeRole), canSwitch: true } : null;
}
