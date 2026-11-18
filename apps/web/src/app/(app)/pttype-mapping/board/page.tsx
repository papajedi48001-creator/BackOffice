import { isAdmin } from '@backoffice/core';
import { pttypeMappingService } from '../../../../lib/hosxp';
import { MappingBoard } from '../mapping-board';
import { mappingContext, MappingPageMessage } from '../mapping-page';

export const dynamic = 'force-dynamic';
const TITLE = 'ผูกผังบัญชีกับสิทธิการรักษา';

/** ผูกผังบัญชี: read live from HOSxP on every visit; nothing from HOSxP is stored in BackOffice. */
export default async function MappingBoardPage() {
  const context = await mappingContext();
  if (!context.ok) return <MappingPageMessage title={TITLE} reason={context.reason} />;
  const loaded = await pttypeMappingService(context.database).load();
  if (!loaded.ok) return <MappingPageMessage title={TITLE} reason={loaded.code} connectionLink={isAdmin(context.session)} />;
  return <section className="mapping-page"><MappingBoard snapshot={loaded.snapshot} editors={loaded.editors} /></section>;
}
