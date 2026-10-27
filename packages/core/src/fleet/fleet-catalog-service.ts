import { randomUUID } from 'node:crypto';
import { fleetDriverInputSchema, fleetVehicleInputSchema, type FleetDriverInput, type FleetVehicleInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

function isDuplicateEntry(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, errno } = error as { code?: string; errno?: number };
  return code === 'ER_DUP_ENTRY' || errno === 1062;
}

/** The car register and the driver list. Callers check `canManageFleet` first. */
export class FleetCatalogService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async createVehicle(actorPersonId: string, input: FleetVehicleInput): Promise<{ ok: true; vehicleId: string } | { ok: false; code: 'DUPLICATE_REGISTRATION' }> {
    const vehicle = fleetVehicleInputSchema.parse(input);
    const vehicleId = this.createId();
    return this.database.transaction(async (database) => {
      try {
        await database.execute('INSERT INTO fleet_vehicle (id, registration, make_model, kind, seats, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [vehicleId, vehicle.registration, vehicle.makeModel, vehicle.kind, vehicle.seats, vehicle.status, vehicle.note]);
      } catch (error) {
        if (isDuplicateEntry(error)) return { ok: false as const, code: 'DUPLICATE_REGISTRATION' as const };
        throw error;
      }
      await this.audit(database, actorPersonId, 'fleet.vehicle.create', 'fleet_vehicle', vehicleId, { registration: vehicle.registration, status: vehicle.status });
      return { ok: true as const, vehicleId };
    });
  }

  async updateVehicle(actorPersonId: string, vehicleId: string, input: FleetVehicleInput): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_REGISTRATION' }> {
    const vehicle = fleetVehicleInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const [existing] = await database.query<{ id: string }>('SELECT id FROM fleet_vehicle WHERE id = ? FOR UPDATE', [vehicleId]);
      if (!existing) return { ok: false as const, code: 'NOT_FOUND' as const };
      try {
        await database.execute('UPDATE fleet_vehicle SET registration = ?, make_model = ?, kind = ?, seats = ?, status = ?, note = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [vehicle.registration, vehicle.makeModel, vehicle.kind, vehicle.seats, vehicle.status, vehicle.note, vehicleId]);
      } catch (error) {
        if (isDuplicateEntry(error)) return { ok: false as const, code: 'DUPLICATE_REGISTRATION' as const };
        throw error;
      }
      await this.audit(database, actorPersonId, 'fleet.vehicle.update', 'fleet_vehicle', vehicleId, { registration: vehicle.registration, status: vehicle.status });
      return { ok: true as const };
    });
  }

  async upsertDriver(actorPersonId: string, input: FleetDriverInput): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'DRIVER_HAS_TRIPS' }> {
    const driver = fleetDriverInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const [person] = await database.query<{ id: string }>('SELECT id FROM person WHERE id = ? FOR UPDATE', [driver.personId]);
      if (!person) return { ok: false as const, code: 'NOT_FOUND' as const };
      const [existing] = await database.query<{ person_id: string }>('SELECT person_id FROM fleet_driver WHERE person_id = ? FOR UPDATE', [driver.personId]);
      if (!driver.isActive) {
        const [busy] = await database.query<{ id: string }>("SELECT id FROM fleet_trip WHERE driver_person_id = ? AND status IN ('PLANNED', 'DEPARTED') LIMIT 1 FOR UPDATE", [driver.personId]);
        if (busy) return { ok: false as const, code: 'DRIVER_HAS_TRIPS' as const };
      }
      const isActive = driver.isActive ? 1 : 0;
      if (existing) await database.execute('UPDATE fleet_driver SET phone = ?, is_active = ?, updated_at = UTC_TIMESTAMP() WHERE person_id = ?', [driver.phone, isActive, driver.personId]);
      else await database.execute('INSERT INTO fleet_driver (person_id, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [driver.personId, driver.phone, isActive]);
      await this.audit(database, actorPersonId, existing ? 'fleet.driver.update' : 'fleet.driver.create', 'fleet_driver', driver.personId, { isActive: driver.isActive });
      return { ok: true as const };
    });
  }

  private audit(database: Database, actorPersonId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}
