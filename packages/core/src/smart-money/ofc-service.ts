import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import type { OfcRow } from './ofc-summary';

export type OfcReader = (connection: HosxpConnection, start: string, end: string) => Promise<OfcRow[]>;
export type OfcLoad = { ok: true; rows: OfcRow[] } | { ok: false; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
