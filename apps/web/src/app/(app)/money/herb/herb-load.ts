import type { AccessSubject } from '@backoffice/contracts';
import { FdhDocumentService, herbReceivedFromRep, herbRules, summarizeHerb, ttmPeriodText, ttmPresets, ttmRange, ttmRules, type HerbSummary, type TtmPreset } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { herbService } from '../../../../lib/hosxp';
import { getNationalIdProtector } from '../../../../lib/national-id';
import { ttmSettingsFromEnv } from '../../../../lib/money/ttm-config';
import { readRuntimeValue } from '../../../../lib/runtime-env';

/** REP state for รับจริง: how many REP files there are, or that they cannot be opened without the key. */
export type HerbRepState = { kind: 'files'; count: number } | { kind: 'not-configured' };
export type HerbOutcome = { kind: 'data'; summary: HerbSummary; rep: HerbRepState } | { kind: 'error'; code: 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export type HerbPageData = { start: string; end: string; presets: TtmPreset[]; periodText: string; pointBaht: number | null; outcome: HerbOutcome };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** การจ่ายยาสมุนไพร: the TTM range and settings plus HERB_POINT_BAHT, the rows read live from HOSxP and รับจริง from the stored REP. */
export async function loadHerbPage(database: Database, subject: AccessSubject, params: Record<string, string | string[] | undefined>): Promise<HerbPageData> {
  const today = bangkokToday();
  const { start, end } = ttmRange({ start: one(params.start), end: one(params.end) }, today);
  const rules = herbRules({ point_baht: readRuntimeValue('HERB_POINT_BAHT') ?? '' }, ttmRules(ttmSettingsFromEnv(readRuntimeValue)));
  const base = { start, end, presets: ttmPresets(today), periodText: ttmPeriodText(start, end), pointBaht: rules.pointBaht };
  const loaded = await herbService(database).load(start, end, rules.herbIcodes);
  if (!loaded.ok) return { ...base, outcome: { kind: 'error', code: loaded.code } };
  const reps = await new FdhDocumentService(database, getNationalIdProtector()).herbRep(subject);
  const docs = reps.ok ? reps.docs : [];
  const rep: HerbRepState = reps.ok || reps.code === 'FORBIDDEN' ? { kind: 'files', count: docs.length } : { kind: 'not-configured' };
  const summary = summarizeHerb(loaded.rows, rules, docs.length > 0 ? herbReceivedFromRep(docs) : null);
  return { ...base, outcome: { kind: 'data', summary, rep } };
}
