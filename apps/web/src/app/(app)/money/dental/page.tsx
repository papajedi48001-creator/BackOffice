import { dentalGroupSchema, dentalPeriodSchema } from '@backoffice/contracts';
import { dentalPresets, dentalRange, isAdmin, summarizeDental } from '@backoffice/core';
import { bangkokToday } from '../../../../lib/bangkok-time';
import { dentalService } from '../../../../lib/hosxp';
import { moneyContext, MoneyPageMessage } from '../money-page';
import { DentalDashboard, type DentalOutcome } from './dental-dashboard';

export const dynamic = 'force-dynamic';
const TITLE = 'Dashboard ลูกหนี้ทันตกรรม';
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

/** ลูกหนี้ทันตกรรม read live from HOSxP for the chosen range; the range is checked before any query. */
export default async function DentalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await moneyContext({ page: 'dental' });
  if (!context.ok) return <MoneyPageMessage title={TITLE} reason={context.reason} />;
  const params = await searchParams;
  const today = bangkokToday();
  const group = dentalGroupSchema.catch('pttype').parse(one(params.group));
  const period = dentalPeriodSchema.catch('day').parse(one(params.period));
  const range = dentalRange({ start: one(params.start), end: one(params.end) }, today);
  let outcome: DentalOutcome;
  if (!range.ok) outcome = { kind: 'range', code: range.code };
  else {
    const loaded = await dentalService(context.database).load(range.start, range.end);
    outcome = loaded.ok ? { kind: 'data', rows: loaded.rows, summary: summarizeDental(loaded.rows, group, period) } : { kind: 'error', code: loaded.code };
  }
  // A typed range that is too long or reversed stays in the filter so it can be fixed; an unreadable one falls back to this month.
  const shown = range.ok || range.code !== 'INVALID_DATE' ? range : dentalRange({}, today);
  return <DentalDashboard start={shown.start} end={shown.end} group={group} period={period} presets={dentalPresets(today)} showConnectionLink={isAdmin(context.session)} outcome={outcome} />;
}
