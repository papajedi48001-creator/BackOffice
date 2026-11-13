import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import type { DentalRow } from './dental-summary';

export type DentalReader = (connection: HosxpConnection, start: string, end: string) => Promise<DentalRow[]>;
export type DentalLoad = { ok: true; rows: DentalRow[] } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };

/** ลูกหนี้ทันตกรรม straight from HOSxP through the connection under ตั้งค่าการเชื่อมต่อ; nothing is stored. */
export class DentalService {
  constructor(private readonly resolveConnection: () => Promise<HosxpConnection | null>, private readonly reader: DentalReader) {}

  async load(start: string, end: string): Promise<DentalLoad> {
    const connection = await this.resolveConnection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    try {
      return { ok: true, rows: await this.reader(connection, start, end) };
    } catch (error) {
      // The driver's message can name the host and user, so only its code is logged.
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : 'UNKNOWN';
      console.error('[smart-money] dental HOSxP read failed', code);
      return { ok: false, code: 'HOSXP_FAILED' };
    }
  }
}
