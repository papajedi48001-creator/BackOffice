import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service.ts';
import { DatabaseAuditRepository } from '../audit/database-audit-repository.ts';

/** Pictures the ผู้ดูแลระบบ sets for the whole site. `login-hero`: the hospital photo behind the sign-in page. */
export type SiteImageSlot = 'login-hero';
export const siteImageSlots: readonly SiteImageSlot[] = ['login-hero'];
export type SiteImageType = 'image/jpeg' | 'image/png' | 'image/webp';
/** A large photo still fits comfortably in a MEDIUMBLOB and one request; anything bigger should be resized first. */
export const maxSiteImageBytes = 3 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, prefix: readonly number[], offset = 0) => prefix.every((value, index) => bytes[offset + index] === value);

/**
 * The type is read from the file's own first bytes, never from its name or the browser's claim, so only these three
 * raster formats are ever stored and served (no SVG or HTML that a browser could run).
 */
export function detectImageType(bytes: Uint8Array): SiteImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return null;
}

export interface SiteImage { contentType: SiteImageType; data: Buffer; version: string }

/**
 * Site pictures live in the database rather than the attachment store: they are public, small, set by an admin, and
 * must not wait in the virus-scan queue (staging runs without ClamAV when memory is short).
 */
export class SiteImageService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async save(slot: SiteImageSlot, bytes: Uint8Array, actorPersonId: string): Promise<{ ok: true; version: string } | { ok: false; code: 'INVALID_IMAGE' | 'TOO_LARGE' }> {
    if (bytes.byteLength > maxSiteImageBytes) return { ok: false, code: 'TOO_LARGE' };
    const contentType = detectImageType(bytes);
    if (!contentType) return { ok: false, code: 'INVALID_IMAGE' };
    const data = Buffer.from(bytes);
    // A short content hash: the sign-in page adds it to the image URL, so browsers fetch a new photo at once.
    const version = createHash('sha256').update(data).digest('hex').slice(0, 16);
    await this.database.transaction(async (database) => {
      await database.execute(
        'INSERT INTO site_image (slot, content_type, data, version, updated_by_person_id, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), data = VALUES(data), version = VALUES(version), updated_by_person_id = VALUES(updated_by_person_id), updated_at = VALUES(updated_at)',
        [slot, contentType, data, version, actorPersonId]
      );
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'admin.site_image.update', targetType: 'site_image', targetId: slot, result: 'SUCCESS', metadata: { contentType, bytes: data.byteLength } });
    });
    return { ok: true, version };
  }

  async read(slot: SiteImageSlot): Promise<SiteImage | null> {
    const [row] = await this.database.query<{ contentType: SiteImageType; data: Buffer; version: string }>('SELECT content_type AS contentType, data, version FROM site_image WHERE slot = ?', [slot]);
    return row ?? null;
  }

  /** Only the version, for pages that link to the picture without loading it. */
  async version(slot: SiteImageSlot): Promise<string | null> {
    const [row] = await this.database.query<{ version: string }>('SELECT version FROM site_image WHERE slot = ?', [slot]);
    return row?.version ?? null;
  }

  async remove(slot: SiteImageSlot, actorPersonId: string): Promise<{ ok: true }> {
    await this.database.transaction(async (database) => {
      await database.execute('DELETE FROM site_image WHERE slot = ?', [slot]);
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'admin.site_image.remove', targetType: 'site_image', targetId: slot, result: 'SUCCESS', metadata: {} });
    });
    return { ok: true };
  }
}
