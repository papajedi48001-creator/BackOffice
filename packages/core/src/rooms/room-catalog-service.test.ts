import { describe, expect, it } from 'vitest';
import type { AuditEvent, RoomActor } from '@backoffice/contracts';
import { RoomCatalogService, type RoomAddonDetails, type RoomCatalogRepository, type RoomDetails } from './room-catalog-service';

function setup() {
  const rooms = new Map<string, RoomDetails>();
  const addons = new Map<string, RoomAddonDetails>();
  const audit: AuditEvent[] = [];
  const repository: RoomCatalogRepository = {
    transaction: async (work) => work(repository),
    findRoom: async (id) => rooms.get(id) ?? null,
    saveRoom: async (room) => { rooms.set(room.id, room); },
    findAddon: async (id) => addons.get(id) ?? null,
    saveAddon: async (addon) => { addons.set(addon.id, addon); },
    appendAudit: async (event) => { audit.push(event); }
  };
  let sequence = 0;
  return { rooms, addons, audit, service: new RoomCatalogService(repository, undefined, () => `id-${++sequence}`) };
}

const manager: RoomActor = { personId: 'manager', roles: [{ name: 'room-manager', organizationId: 'admin-unit' }] };
const room = { name: 'ห้องประชุมใหญ่', place: 'อาคารอำนวยการ ชั้น 2', capacity: 40, equipment: 'จอ LED', ownerOrganizationId: 'admin-unit', isBookable: true };

describe('RoomCatalogService', () => {
  it('creates a room owned by the manager organization and audits it without its name', async () => {
    const { rooms, audit, service } = setup();

    const created = await service.createRoom(manager, room);

    expect(rooms.get(created.id)).toEqual({ id: created.id, ...room });
    expect(audit).toEqual([expect.objectContaining({ action: 'room.created', targetType: 'room', targetId: created.id, actorPersonId: 'manager', result: 'SUCCESS' })]);
    expect(audit[0]!.metadata).not.toContain('ห้องประชุมใหญ่');
  });

  it('forbids a manager from creating a room for another organization', async () => {
    const { service } = setup();
    await expect(service.createRoom(manager, { ...room, ownerOrganizationId: 'other-unit' })).rejects.toThrow('FORBIDDEN');
  });

  it('forbids moving a room to an organization outside the manager scope', async () => {
    const { service } = setup();
    const created = await service.createRoom(manager, room);
    await expect(service.updateRoom(manager, created.id, { ...room, ownerOrganizationId: 'other-unit' })).rejects.toThrow('FORBIDDEN');
  });

  it('closes a room for booking and records which fields changed', async () => {
    const { rooms, audit, service } = setup();
    const created = await service.createRoom(manager, room);

    await service.updateRoom(manager, created.id, { ...room, isBookable: false });

    expect(rooms.get(created.id)?.isBookable).toBe(false);
    expect(JSON.parse(audit.at(-1)!.metadata)).toEqual({ roomId: created.id, changedFields: ['isBookable'] });
  });

  it('reports an unknown room', async () => {
    const { service } = setup();
    await expect(service.updateRoom(manager, 'missing', room)).rejects.toThrow('ROOM_NOT_FOUND');
  });

  it('lets any room manager maintain add-ons but nobody else', async () => {
    const { addons, service } = setup();
    const addon = await service.createAddon(manager, { name: 'ไมโครโฟนไร้สาย', unit: 'ตัว', isActive: true });
    await service.updateAddon(manager, addon.id, { name: 'ไมโครโฟนไร้สาย', unit: 'ตัว', isActive: false });
    expect(addons.get(addon.id)?.isActive).toBe(false);
    await expect(service.createAddon({ personId: 'someone', roles: [] }, { name: 'อาหารว่าง', unit: 'ชุด', isActive: true })).rejects.toThrow('FORBIDDEN');
  });
});
