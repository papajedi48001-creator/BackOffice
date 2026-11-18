import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import type { HerbRow } from './herb-summary';

export type HerbReader = (connection: HosxpConnection, start: string, end: string, icodes: readonly string[]) => Promise<HerbRow[]>;
export type HerbLoad = { ok: true; rows: HerbRow[] } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };

/** การจ่ายยาสมุนไพร straight from HOSxP through the connection under ตั้งค่าการเชื่อมต่อ; nothing is stored. */
export class HerbService {
  constructor(private readonly resolveConnection: () => Promise<HosxpConnection | null>, private readonly reader: HerbReader) {}

  async load(start: string, end: string, icodes: readonly string[]): Promise<HerbLoad> {
    const connection = await this.resolveConnection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    try {
      return { ok: true, rows: await this.reader(connection, start, end, icodes) };
    } catch (error) {
      // The driver's message can name the host and user, so only its code is logged.
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : 'UNKNOWN';
      console.error('[smart-money] herb HOSxP read failed', code);
      return { ok: false, code: 'HOSXP_FAILED' };
    }
  }
}
