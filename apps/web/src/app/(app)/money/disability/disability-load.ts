import { DpRecordService, ImcService } from '@backoffice/core';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { disabilityCards, disabilityTab, dpFigures, imcFigures, ofcFigures, DISABILITY_TABS, type DisabilityCard, type DisabilityTab } from '../../../../lib/money/disability-tabs';
import { getNationalIdProtector } from '../../../../lib/national-id';
import type { MoneyContext } from '../money-page';
import { loadOfcPage, type OfcPageData } from '../ofc/ofc-load';

type Ready = Extract<MoneyContext, { ok: true }>;
export type DisabilityPageData = { tabs: DisabilityTab[]; current: DisabilityTab; cards: DisabilityCard[]; ofc: OfcPageData | null };

const quietly = async <T>(read: () => Promise<T | null>): Promise<T | null> => {
  try { return await read(); } catch (error) {
    // A card is a summary: when one cannot be read it shows "ยังไม่มีข้อมูล" and the tab itself says what went wrong.
    console.error('[smart-money] disability card failed', error instanceof Error ? error.name : 'UNKNOWN');
    return null;
  }
};

/** Which tabs this person may open (IMC and บริการฟื้นฟู need the disability page, Instrument OFC the ofc page), the open tab and the card figures. */
export async function loadDisabilityPage(context: Ready, params: Record<string, string | string[] | undefined>, can: (page: 'disability' | 'ofc') => boolean): Promise<DisabilityPageData | null> {
  const tabs = DISABILITY_TABS.filter((tab) => can(tab === 'ofc' ? 'ofc' : 'disability'));
  if (tabs.length === 0) return null;
  const asked = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const current = disabilityTab(asked, tabs);
  const { database, session } = context;
  const protector = getNationalIdProtector();
  const [imc, ofc, dp] = await Promise.all([
    tabs.includes('imc') ? quietly(async () => { const result = await new ImcService(database, protector).overview(session); return result.ok ? imcFigures(result, bangkokToday()) : null; }) : null,
    tabs.includes('ofc') ? quietly(() => loadOfcPage(database, session, params)) : null,
    tabs.includes('dp') ? quietly(async () => { const result = await new DpRecordService(database, protector).summaries(session); return result.ok ? dpFigures(result.years) : null; }) : null
  ]);
  const range = ofc ? { start: ofc.start, end: ofc.end } : { start: '', end: '' };
  const ofcData = ofc?.outcome?.kind === 'data' ? ofcFigures(ofc.outcome.summary) : null;
  return { tabs, current, cards: disabilityCards({ tabs, current, range, imc, ofc: ofcData, dp }), ofc };
}
