import type { Database } from '@backoffice/db';

export interface AttendanceDeviceRow { id: string; name: string; locationId: string; locationName: string; paired: boolean; revoked: boolean; lastSeenAt: string | null; online: boolean }

/** A box is ออนไลน์ when it reached the server within the last 2 minutes (it sends a heartbeat every 60 seconds). */
export class DeviceQueries {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  async list(): Promise<AttendanceDeviceRow[]> {
    const rows = await this.database.query<{ id: string; name: string; locationId: string; locationName: string; paired: number; revoked: number; lastSeenAt: string | null; online: number }>(
      `SELECT d.id, d.name, d.location_id AS locationId, l.name AS locationName, d.public_key_jwk IS NOT NULL AS paired, d.revoked_at IS NOT NULL AS revoked,
        DATE_FORMAT(d.last_seen_at, '%Y-%m-%dT%H:%i:%sZ') AS lastSeenAt, (d.revoked_at IS NULL AND d.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 2 MINUTE) AS online
       FROM attendance_device d JOIN attendance_location l ON l.id = d.location_id ORDER BY l.name, d.name`
    );
    return rows.map((row) => ({ ...row, paired: Number(row.paired) === 1, revoked: Number(row.revoked) === 1, online: Number(row.online) === 1 }));
  }
}
