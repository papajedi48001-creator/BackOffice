import { randomUUID } from 'node:crypto';
import { ROOM_BOOKING_MODULE, roomAddonInputSchema, roomInputSchema, type AuditEvent, type RoomActor, type RoomAddonInput, type RoomInput } from '@backoffice/contracts';
import { AuthorizationService } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';

export interface RoomDetails { id: string; name: string; place: string; capacity: number; equipment: string; ownerOrganizationId: string; isBookable: boolean; }
export interface RoomAddonDetails { id: string; name: string; unit: string; isActive: boolean; }

export interface RoomCatalogRepository {
  transaction<T>(work: (repository: RoomCatalogRepository) => Promise<T>): Promise<T>;
  findRoom(roomId: string): Promise<RoomDetails | null>;
  saveRoom(room: RoomDetails): Promise<void>;
  findAddon(addonId: string): Promise<RoomAddonDetails | null>;
  saveAddon(addon: RoomAddonDetails): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}

export class RoomCatalogService {
  constructor(private readonly repository: RoomCatalogRepository, private readonly authorizer: AuthorizationService = new AuthorizationService(), private readonly createId: () => string = randomUUID) {}

  async createRoom(actor: RoomActor, input: RoomInput): Promise<RoomDetails> {
    const valid = roomInputSchema.parse(input);
    await this.requireRoomScope(actor, valid.ownerOrganizationId);
    const room: RoomDetails = { id: this.createId(), ...valid };
    return this.repository.transaction(async (repository) => {
      await repository.saveRoom(room);
      await this.audit(repository, actor, 'room.created', 'room', room.id, { roomId: room.id });
      return room;
    });
  }

  async updateRoom(actor: RoomActor, roomId: string, input: RoomInput): Promise<RoomDetails> {
    const valid = roomInputSchema.parse(input);
    return this.repository.transaction(async (repository) => {
      const existing = await repository.findRoom(roomId);
      if (!existing) throw new Error('ROOM_NOT_FOUND');
      await this.requireRoomScope(actor, existing.ownerOrganizationId);
      await this.requireRoomScope(actor, valid.ownerOrganizationId);
      const room: RoomDetails = { id: roomId, ...valid };
      const changedFields = (Object.keys(valid) as (keyof typeof valid)[]).filter((key) => existing[key] !== room[key]);
      await repository.saveRoom(room);
      await this.audit(repository, actor, 'room.updated', 'room', roomId, { roomId, changedFields });
      return room;
    });
  }

  async createAddon(actor: RoomActor, input: RoomAddonInput): Promise<RoomAddonDetails> {
    const valid = roomAddonInputSchema.parse(input);
    this.requireAnyManager(actor);
    const addon: RoomAddonDetails = { id: this.createId(), ...valid };
    return this.repository.transaction(async (repository) => {
      await repository.saveAddon(addon);
      await this.audit(repository, actor, 'room_addon.created', 'room_addon', addon.id, {});
      return addon;
    });
  }

  async updateAddon(actor: RoomActor, addonId: string, input: RoomAddonInput): Promise<RoomAddonDetails> {
    const valid = roomAddonInputSchema.parse(input);
    this.requireAnyManager(actor);
    return this.repository.transaction(async (repository) => {
      const existing = await repository.findAddon(addonId);
      if (!existing) throw new Error('ADDON_NOT_FOUND');
      const addon: RoomAddonDetails = { id: addonId, ...valid };
      await repository.saveAddon(addon);
      await this.audit(repository, actor, 'room_addon.updated', 'room_addon', addonId, { changedFields: (Object.keys(valid) as (keyof typeof valid)[]).filter((key) => existing[key] !== addon[key]) });
      return addon;
    });
  }

  private subject(actor: RoomActor) { return { authenticated: true, personId: actor.personId, roles: actor.roles, dataOwnerModules: [] }; }

  private async requireRoomScope(actor: RoomActor, organizationId: string): Promise<void> {
    if (!(await this.authorizer.canAccess(this.subject(actor), 'room.manage', { moduleCode: ROOM_BOOKING_MODULE, organizationId })).allowed) throw new Error('FORBIDDEN');
  }

  // Add-ons are shared by every room, so any room manager may maintain them.
  private requireAnyManager(actor: RoomActor): void {
    const scope = this.authorizer.organizationScope(this.subject(actor), 'room.manage');
    if (scope !== 'all' && scope.length === 0) throw new Error('FORBIDDEN');
  }

  private async audit(repository: RoomCatalogRepository, actor: RoomActor, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    await new AuditService({ append: (event) => repository.appendAudit(event) }, this.createId).recordAudit({ actorPersonId: actor.personId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}
