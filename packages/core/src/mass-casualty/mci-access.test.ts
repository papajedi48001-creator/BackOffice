import { describe, expect, it } from 'vitest';
import type { MciCommandRole } from '@backoffice/contracts';
import { canCommandMci, mciCan, type MciAction } from './mci-access';

const actor = (commandRole: MciCommandRole, zoneId: string | null = 'er') => ({ personId: 'p', commandRole, zoneId });
const subject = (roles: string[]) => ({ authenticated: true, personId: 'p', roles: roles.map((name) => ({ name, organizationId: null })), dataOwnerModules: [] });

describe('canCommandMci', () => {
  it('lets the ผู้ดูแลระบบ and the ผู้จัดการอุบัติเหตุหมู่ command, nobody else', () => {
    expect(canCommandMci(subject(['admin']))).toBe(true);
    expect(canCommandMci(subject(['mci-manager']))).toBe(true);
    expect(canCommandMci(subject(['fleet-manager']))).toBe(false);
    expect(canCommandMci({ ...subject(['mci-manager']), authenticated: false })).toBe(false);
  });
});

describe('mciCan follows the spec table', () => {
  const rows: Array<[string, Parameters<typeof mciCan>[0], boolean, MciAction, string | null | undefined, boolean]> = [
    ['commander records', actor('COMMANDER'), false, 'record', 'opd', true],
    ['commander edits any zone', actor('COMMANDER'), false, 'editPatient', 'opd', true],
    ['commander assigns roles', actor('COMMANDER'), false, 'assignRole', 'opd', true],
    ['commander moves anyone', actor('COMMANDER'), false, 'manageResponder', null, true],
    ['manager not checked in commands', null, true, 'assignRole', 'opd', true],
    ['zone lead records in own zone', actor('ZONE_LEAD'), false, 'record', 'er', true],
    ['zone lead cannot record in another zone', actor('ZONE_LEAD'), false, 'record', 'opd', false],
    ['zone lead edits own zone', actor('ZONE_LEAD'), false, 'editPatient', 'er', true],
    ['zone lead cannot edit another zone', actor('ZONE_LEAD'), false, 'editPatient', 'opd', false],
    ['zone lead moves own zone people', actor('ZONE_LEAD'), false, 'manageResponder', 'er', true],
    ['zone lead cannot move people elsewhere', actor('ZONE_LEAD'), false, 'manageResponder', 'opd', false],
    ['zone lead cannot assign roles', actor('ZONE_LEAD'), false, 'assignRole', 'er', false],
    ['zone lead without a zone does nothing in zones', actor('ZONE_LEAD', null), false, 'editPatient', null, false],
    ['recorder records anywhere', actor('RECORDER'), false, 'record', 'opd', true],
    ['recorder edits any zone', actor('RECORDER'), false, 'editPatient', 'opd', true],
    ['recorder cannot move people', actor('RECORDER'), false, 'manageResponder', 'er', false],
    ['recorder views casualties', actor('RECORDER'), false, 'viewPatients', undefined, true],
    ['staff cannot record', actor('STAFF'), false, 'record', 'er', false],
    ['staff cannot view the full list', actor('STAFF'), false, 'viewPatients', undefined, false],
    ['not checked in does nothing', null, false, 'viewPatients', undefined, false]
  ];
  it.each(rows)('%s', (_, who, commands, action, zone, expected) => {
    expect(mciCan(who, commands, action, zone)).toBe(expected);
  });
});
