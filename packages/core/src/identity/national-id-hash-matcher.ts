import { createHash, timingSafeEqual } from 'node:crypto';
import type { Database } from '@backoffice/db';
import type { NationalIdProtector } from '../crypto/national-id';

/**
 * Finds the ACTIVE บุคลากร whose national ID gives Provider ID's hash_cid. The ministry does not document hash_cid;
 * SHA-256 hex of the 13 digits is assumed, so a wrong guess matches nobody rather than the wrong person.
 * National IDs are decrypted in memory only and never leave this method.
 */
export class NationalIdHashMatcher {
  constructor(private readonly database: Database, private readonly protector: NationalIdProtector) {}

  async findActivePerson(hashCid: string): Promise<string | null> {
    if (!/^[0-9a-f]{64}$/.test(hashCid)) return null;
    const wanted = Buffer.from(hashCid, 'hex');
    const rows = await this.database.query<{ id: string; ciphertext: string }>(
      "SELECT id, national_id_ciphertext AS ciphertext FROM person WHERE employment_status = 'ACTIVE'");
    const found: string[] = [];
    for (const row of rows) {
      let nationalId: string;
      try { nationalId = this.protector.decrypt(row.ciphertext); } catch { continue; }
      if (timingSafeEqual(createHash('sha256').update(nationalId, 'utf8').digest(), wanted)) found.push(row.id);
    }
    return found.length === 1 ? found[0]! : null;
  }
}
