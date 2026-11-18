import { pttypeMappingService } from '../../../../lib/hosxp';
import { mappingContext, MappingPageMessage } from '../mapping-page';
import { HistoryTable } from './history-table';

export const dynamic = 'force-dynamic';

/** ประวัติการแก้ไข from BackOffice's audit; works even while HOSxP is unreachable. Latest 200 changes. */
export default async function MappingHistoryPage() {
  const context = await mappingContext();
  if (!context.ok) return <MappingPageMessage title="ประวัติการแก้ไข" reason={context.reason} />;
  return <section className="mapping-page"><HistoryTable rows={await pttypeMappingService(context.database).history()} /></section>;
}
