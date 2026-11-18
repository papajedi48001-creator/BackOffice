import { summarizeTtm, ttmPeriodText, ttmPresets, ttmRange, ttmRules, type TtmPreset, type TtmRules, type TtmSummary } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { ttmService } from '../../../../lib/hosxp';
import { ttmSettingsFromEnv } from '../../../../lib/money/ttm-config';
import { readRuntimeValue } from '../../../../lib/runtime-env';

export type TtmOutcome = { kind: 'data'; summary: TtmSummary } | { kind: 'error'; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export type TtmPageData = { start: string; end: string; presets: TtmPreset[]; periodText: string; rules: TtmRules; outcome: TtmOutcome };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** Both แพทย์แผนไทย pages: the range fixed the legacy way, the TTM_* settings, and the summary read live from HOSxP. */
export async function loadTtmPage(database: Database, params: Record<string, string | string[] | undefined>): Promise<TtmPageData> {
  const today = bangkokToday();
  const { start, end } = ttmRange({ start: one(params.start), end: one(params.end) }, today);
  const rules = ttmRules(ttmSettingsFromEnv(readRuntimeValue));
  const loaded = await ttmService(database).load(start, end);
  const outcome: TtmOutcome = loaded.ok ? { kind: 'data', summary: summarizeTtm(loaded.data.services, loaded.data.visits, loaded.data.items, rules) } : { kind: 'error', code: loaded.code };
  return { start, end, presets: ttmPresets(today), periodText: ttmPeriodText(start, end), rules, outcome };
}
