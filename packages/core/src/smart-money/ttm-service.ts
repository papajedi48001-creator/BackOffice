import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import type { TtmItem } from './ttm-rules';
import type { TtmServiceRow, TtmVisit } from './ttm-summary';

export type TtmData = { services: TtmServiceRow[]; visits: TtmVisit[]; items: TtmItem[] };
export type TtmReader = (connection: HosxpConnection, start: string, end: string) => Promise<TtmData>;
export type TtmLoad = { ok: true; data: TtmData } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };

/** งานแพทย์แผนไทย straight from HOSxP through the connection under ตั้งค่าการเชื่อมต่อ; nothing is stored. */
export class TtmService {
  constructor(private readonly resolveConnection: () => Promise<HosxpConnection | null>, private readonly reader: TtmReader) {}

  async load(start: string, end: string): Promise<TtmLoad> {
    const connection = await this.resolveConnection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    try {
      return { ok: true, data: await this.reader(connection, start, end) };
    } catch (error) {
      // The driver's message can name the host and user, so only its code is logged.
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : 'UNKNOWN';
      console.error('[smart-money] ttm HOSxP read failed', code);
      return { ok: false, code: 'HOSXP_FAILED' };
    }
  }
}
