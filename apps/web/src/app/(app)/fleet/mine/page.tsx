import Link from 'next/link';
import { t } from '@backoffice/i18n';
import { formatFleetRange } from '../../../../lib/fleet-labels';
import { fleetContext, FleetPageMessage, FleetStatus } from '../fleet-page';

/** ใบขอใช้รถของฉัน, newest first. */
export default async function MyFleetRequestsPage() {
  const context = await fleetContext();
  if (!context.ok) return <FleetPageMessage titleKey="fleetMine" reason={context.reason} />;
  const items = await context.queries.mine(context.session.personId);
  return <section>
    <div className="page-heading"><h2>{t('fleetMine')}</h2><div className="page-actions"><Link className="button-link" href="/fleet/new">{t('fleetNew')}</Link></div></div>
    {items.length === 0 ? <p>{t('fleetNoRequests')}</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>{t('fleetReference')}</th><th>{t('fleetPurpose')}</th><th>{t('fleetDestination')}</th><th>{t('fleetTimes')}</th><th>{t('status')}</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td><Link href={`/fleet/requests/${item.id}`}>{item.reference}</Link></td>
        <td>{item.purpose}</td>
        <td>{item.destination}</td>
        <td>{formatFleetRange(item.departAt, item.returnAt)}</td>
        <td><FleetStatus status={item.status} /></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
