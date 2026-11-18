import { HISTORY_LIMIT } from '@backoffice/core';
import { pttypeMappingService } from '../../../../lib/hosxp';
import { mappingContext, MappingPageMessage } from '../mapping-page';
import { HistoryTable } from './history-table';

export const dynamic = 'force-dynamic';

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';
const day = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');

/** ประวัติการแก้ไข from BackOffice's audit; works even while HOSxP is unreachable. The latest 200 changes in the range in the address. */
export default async function MappingHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await mappingContext();
  if (!context.ok) return <MappingPageMessage title="ประวัติการแก้ไข" reason={context.reason} />;
  const params = await searchParams;
  const from = day(one(params.from));
  const to = day(one(params.to));
  const rows = await pttypeMappingService(context.database).history({ from: from || undefined, to: to || undefined, limit: HISTORY_LIMIT });
  return <section className="mapping-page"><HistoryTable rows={rows} from={from} to={to} limit={HISTORY_LIMIT} /></section>;
}
