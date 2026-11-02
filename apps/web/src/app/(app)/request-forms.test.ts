import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ leaveSession: vi.fn(), pageActor: vi.fn(), redirect: vi.fn(), getSharedDatabase: vi.fn(), typesFor: vi.fn(), detail: vi.fn(), leaderOf: vi.fn(), listRooms: vi.fn(), listAddons: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('./leave/leave-page', () => ({ leaveSession: mocks.leaveSession }));
vi.mock('./travel/travel-page', () => ({ travelSession: mocks.leaveSession }));
vi.mock('./travel/travel-leader', () => ({ leaderOf: mocks.leaderOf }));
vi.mock('../../lib/actor', () => ({ pageActor: mocks.pageActor }));
vi.mock('../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('../../lib/attachments', () => ({ attachmentsEnabled: () => true }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  LeaveQueries: class { typesFor = mocks.typesFor; },
  OfficialTravelQueries: class { detail = mocks.detail; },
  RoomBookingQueries: class { listRooms = mocks.listRooms; listAddons = mocks.listAddons; }
}));

import { loadRequestForm } from './request-forms';

const session = { authenticated: true, personId: 'me', roles: [], dataOwnerModules: [] };
afterEach(() => vi.clearAllMocks());

describe('loadRequestForm', () => {
  it('offers the leave types the signed-in person may file', async () => {
    mocks.leaveSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({});
    mocks.typesFor.mockResolvedValue([{ id: 'lt-5', code: 'PATERNITY', name: 'ลาไปช่วยภริยาคลอดบุตร', counting: 'WORKING_DAYS', eligibleGender: 'MALE' }]);
    expect(await loadRequestForm('leave')).toEqual({ module: 'leave', attachments: true, types: [{ id: 'lt-5', code: 'PATERNITY', name: 'ลาไปช่วยภริยาคลอดบุตร', counting: 'WORKING_DAYS' }] });
    expect(mocks.typesFor).toHaveBeenCalledWith('me');
  });

  it('loads the travel leader for the person', async () => {
    mocks.leaveSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({});
    mocks.leaderOf.mockResolvedValue({ personId: 'me', displayName: 'ฉัน', organizationName: null });
    expect(await loadRequestForm('official-travel')).toMatchObject({ module: 'official-travel', leader: { personId: 'me' } });
  });

  it('prefills ขอใช้รถ only from a คำขอไปราชการ the person may see', async () => {
    mocks.leaveSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue({});
    mocks.detail.mockResolvedValue(null);
    expect(await loadRequestForm('fleet', 'travel-x')).toEqual({ module: 'fleet', fromTravel: false });
    expect(mocks.detail).toHaveBeenCalledWith('travel-x', session);
  });

  it('offers bookable rooms and active add-ons', async () => {
    mocks.pageActor.mockResolvedValue({ personId: 'me', roles: [] }); mocks.getSharedDatabase.mockReturnValue({});
    mocks.listRooms.mockResolvedValue([{ id: 'r1', name: 'ห้องประชุม 1', capacity: 10, place: 'ชั้น 2', isActive: true }]);
    mocks.listAddons.mockResolvedValue([{ id: 'a1', name: 'กาแฟ', unit: 'ชุด', isActive: true }]);
    expect(await loadRequestForm('room-booking')).toMatchObject({ module: 'room-booking', rooms: [{ id: 'r1', name: 'ห้องประชุม 1', capacity: 10, place: 'ชั้น 2' }], addons: [{ id: 'a1', name: 'กาแฟ', unit: 'ชุด' }] });
    expect(mocks.listRooms).toHaveBeenCalledWith({ bookableOnly: true });
  });

  it('refuses a signed-out visitor and reports a missing database', async () => {
    mocks.leaveSession.mockResolvedValue(null);
    expect(await loadRequestForm('leave')).toEqual({ module: 'none' });
    mocks.leaveSession.mockResolvedValue(session); mocks.getSharedDatabase.mockReturnValue(null);
    expect(await loadRequestForm('leave')).toEqual({ module: 'unavailable' });
    expect(await loadRequestForm('inventory')).toEqual({ module: 'none' });
  });
});
