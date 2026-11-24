import type { AccessSubject } from '@backoffice/contracts';
import { ttmPeriodText, ttmPresets, ttmRange, type TtmPreset } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { ofcService } from '../../../../lib/hosxp';
import type { OfcOutcome } from './ofc-monitor';

export type OfcPageData = { start: string; end: string; presets: TtmPreset[]; periodText: string; outcome: OfcOutcome | null };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** Monitor Instrument OFC: the range (เดือนนี้ by default, as on the TTM pages) and the visits matched to REP / Statement; null when refused. */
export async function loadOfcPage(database: Database, subject: AccessSubject, params: Record<string, string | string[] | undefined>): Promise<OfcPageData> {
  const today = bangkokToday();
  const { start, end } = ttmRange({ start: one(params.start), end: one(params.end) }, today);
  const base = { start, end, presets: ttmPresets(today), periodText: ttmPeriodText(start, end) };
  const loaded = await ofcService(database).load(subject, start, end);
  if (loaded.ok) return { ...base, outcome: { kind: 'data', summary: loaded.summary, updatedAt: loaded.updatedAt } };
  return { ...base, outcome: loaded.code === 'FORBIDDEN' ? null : { kind: 'error', code: loaded.code } };
}
