import { createHash, randomInt, randomUUID } from 'node:crypto';
import { attendanceDeviceInputSchema, attendancePairInputSchema, type AttendanceDeviceInput, type AttendancePairInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { attendanceAudit } from './attendance-chain';
import { isDuplicateEntry } from './attendance-db';
import { signedPayload, verifyDeviceSignature } from './device-signature';

const PAIRING_MINUTES = 10;
const SKEW_MS = 60_000;
const NONCE_KEEP_MINUTES = 10;

export interface SignedDeviceRequest { deviceId: string; timestamp: string; nonce: string; signature: string; method: string; path: string; body: string }
export type DeviceAuthResult = { ok: true; device: { id: string; locationId: string } } | { ok: false; code: 'DEVICE_REVOKED' | 'DEVICE_SIGNATURE_INVALID' | 'REQUEST_REPLAYED' };

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
/** DATETIME text in UTC; the pool has no time zone set, so Date parameters would be written in the host's zone. */
const sqlTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

/**
 * กล่องลงเวลา: created by the ผู้ดูแลระบบ with a one-time รหัสจับคู่, paired from the box with its own key, revoked at once.
 * Callers check `canManageAttendanceDevices` for create/newPairingCode/revoke. `pair` and `authenticate` come from the box.
 */
export class DeviceService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID, private readonly now: () => Date = () => new Date()) {}

  async create(actor: string, input: AttendanceDeviceInput): Promise<{ ok: true; id: string; pairingCode: string } | { ok: false; code: 'NOT_FOUND' }> {
    const device = attendanceDeviceInputSchema.parse(input);
    return this.database.transaction(async (tx) => {
      const [location] = await tx.query<{ id: string }>('SELECT id FROM attendance_location WHERE id = ? AND is_active = 1', [device.locationId]);
      if (!location) return { ok: false as const, code: 'NOT_FOUND' as const };
      const id = this.createId();
      await tx.execute('INSERT INTO attendance_device (id, name, location_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [id, device.name, device.locationId, actor]);
      const pairingCode = await this.issueCode(tx, id);
      await attendanceAudit(tx, actor, 'attendance.device.create', 'attendance_device', id, { deviceId: id, locationId: device.locationId });
      return { ok: true as const, id, pairingCode };
    });
  }

  /** A new รหัสจับคู่ for a box that was replaced or never paired; older unused codes stop working. */
  async newPairingCode(actor: string, deviceId: string): Promise<{ ok: true; pairingCode: string } | { ok: false; code: 'NOT_FOUND' | 'DEVICE_REVOKED' }> {
    return this.database.transaction(async (tx) => {
      const [device] = await tx.query<{ revokedAt: Date | null }>('SELECT revoked_at AS revokedAt FROM attendance_device WHERE id = ? FOR UPDATE', [deviceId]);
      if (!device) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (device.revokedAt) return { ok: false as const, code: 'DEVICE_REVOKED' as const };
      await tx.execute('UPDATE attendance_device_pairing SET used_at = ? WHERE device_id = ? AND used_at IS NULL', [sqlTime(this.now()), deviceId]);
      const pairingCode = await this.issueCode(tx, deviceId);
      await attendanceAudit(tx, actor, 'attendance.device.pairing_code', 'attendance_device', deviceId, { deviceId });
      return { ok: true as const, pairingCode };
    });
  }

  /** Every failure gives the same answer, so the code cannot be probed. Pairing replaces any earlier key of the box. */
  async pair(input: AttendancePairInput): Promise<{ ok: true; deviceId: string; deviceName: string; locationName: string } | { ok: false; code: 'PAIRING_CODE_INVALID' }> {
    const parsed = attendancePairInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'PAIRING_CODE_INVALID' };
    const { pairingCode, publicKey } = parsed.data;
    const now = sqlTime(this.now());
    return this.database.transaction(async (tx) => {
      const [pairing] = await tx.query<{ id: string; deviceId: string; deviceName: string; locationName: string }>(
        `SELECT p.id, p.device_id AS deviceId, d.name AS deviceName, l.name AS locationName FROM attendance_device_pairing p JOIN attendance_device d ON d.id = p.device_id JOIN attendance_location l ON l.id = d.location_id
         WHERE p.code_hash = ? AND p.used_at IS NULL AND p.expires_at > ? AND d.revoked_at IS NULL FOR UPDATE`, [hashCode(pairingCode), now]);
      if (!pairing) return { ok: false as const, code: 'PAIRING_CODE_INVALID' as const };
      await tx.execute('UPDATE attendance_device_pairing SET used_at = ? WHERE id = ?', [now, pairing.id]);
      await tx.execute('UPDATE attendance_device SET public_key_jwk = ?, paired_at = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [JSON.stringify(publicKey), now, pairing.deviceId]);
      await attendanceAudit(tx, null, 'attendance.device.paired', 'attendance_device', pairing.deviceId, { deviceId: pairing.deviceId });
      return { ok: true as const, deviceId: pairing.deviceId, deviceName: pairing.deviceName, locationName: pairing.locationName };
    });
  }

  async revoke(actor: string, deviceId: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }> {
    return this.database.transaction(async (tx) => {
      const [device] = await tx.query<{ revokedAt: Date | null }>('SELECT revoked_at AS revokedAt FROM attendance_device WHERE id = ? FOR UPDATE', [deviceId]);
      if (!device) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (!device.revokedAt) {
        await tx.execute('UPDATE attendance_device SET revoked_at = ?, revoked_by = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [sqlTime(this.now()), actor, deviceId]);
        await tx.execute('UPDATE attendance_device_pairing SET used_at = ? WHERE device_id = ? AND used_at IS NULL', [sqlTime(this.now()), deviceId]);
        await attendanceAudit(tx, actor, 'attendance.device.revoked', 'attendance_device', deviceId, { deviceId, revoked: true });
      }
      return { ok: true as const };
    });
  }

  /** Checks one signed box request: known paired box, not revoked, timestamp within ±60 s, valid signature, unused nonce. */
  async authenticate(request: SignedDeviceRequest): Promise<DeviceAuthResult> {
    const invalid = { ok: false as const, code: 'DEVICE_SIGNATURE_INVALID' as const };
    const [device] = await this.database.query<{ id: string; locationId: string; publicKeyJwk: string | null; revokedAt: Date | null }>('SELECT id, location_id AS locationId, public_key_jwk AS publicKeyJwk, revoked_at AS revokedAt FROM attendance_device WHERE id = ?', [request.deviceId]);
    if (!device || !device.publicKeyJwk) return invalid;
    if (device.revokedAt) return { ok: false, code: 'DEVICE_REVOKED' };
    const now = this.now();
    const sent = Date.parse(request.timestamp);
    if (!Number.isFinite(sent) || Math.abs(now.getTime() - sent) > SKEW_MS) return invalid;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(request.nonce)) return invalid;
    if (!verifyDeviceSignature(JSON.parse(device.publicKeyJwk) as { kty: string; crv: string; x: string; y: string }, signedPayload(request.method, request.path, request.timestamp, request.nonce, request.body), request.signature)) return invalid;
    try {
      await this.database.execute('INSERT INTO attendance_request_nonce (device_id, nonce, created_at) VALUES (?, ?, ?)', [device.id, request.nonce, sqlTime(now)]);
    } catch (error) {
      if (isDuplicateEntry(error)) return { ok: false, code: 'REQUEST_REPLAYED' };
      throw error;
    }
    await this.database.execute('DELETE FROM attendance_request_nonce WHERE device_id = ? AND created_at < ?', [device.id, sqlTime(new Date(now.getTime() - NONCE_KEEP_MINUTES * 60_000))]);
    await this.database.execute('UPDATE attendance_device SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL', [sqlTime(now), device.id]);
    return { ok: true, device: { id: device.id, locationId: device.locationId } };
  }

  private async issueCode(tx: Database, deviceId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
      try {
        await tx.execute('INSERT INTO attendance_device_pairing (id, device_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [this.createId(), deviceId, hashCode(code), sqlTime(new Date(this.now().getTime() + PAIRING_MINUTES * 60_000))]);
        return code;
      } catch (error) {
        if (!isDuplicateEntry(error)) throw error;
      }
    }
    throw new Error('attendance_pairing_code_exhausted');
  }
}
