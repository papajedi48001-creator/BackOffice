import Link from 'next/link';
import { formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { mciKindLabel } from '../../../../lib/mci-labels';
import { IncidentBanner, mciContext, MciPageMessage } from '../mci-page';
import { CloseIncidentButton, OpenIncidentForm } from './incident-actions';

export const dynamic = 'force-dynamic';
const TITLE = 'เหตุอุบัติเหตุหมู่';

/** เหตุ, for ผู้บัญชาการเหตุ (mci.command): เปิดเหตุ / ปิดเหตุ, and every เหตุ with its summary. */
export default async function MciIncidentsPage() {
  const context = await mciContext({ commander: true });
  if (!context.ok) return <MciPageMessage title={TITLE} reason={context.reason} />;
  const { incident, settings, queries } = context;
  const incidents = await queries.incidents();
  const professions = settings.professions.filter((profession) => profession.isActive).map(({ id, name }) => ({ id, name }));
  return <section className="mci-incidents">
    <h2>{TITLE}</h2>
    <IncidentBanner incident={incident} />
    <div className="request-actions">
      <OpenIncidentForm professions={professions} disabled={incident !== null} />
      {incident && <CloseIncidentButton incidentId={incident.id} title={incident.title} />}
    </div>
    {incident && <p className="muted">เปิดเหตุใหม่ได้หลังปิดเหตุที่เปิดอยู่</p>}
    {incidents.length === 0 ? <p>ยังไม่เคยมีเหตุ</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>เหตุ</th><th>ประเภท</th><th>เกิดเหตุ</th><th>ปิดเหตุ</th><th>ผู้ป่วย</th><th>เจ้าหน้าที่</th><th></th></tr></thead>
      <tbody>{incidents.map((row) => <tr key={row.id}>
        <td>{row.title}{row.location ? <small className="muted"> · {row.location}</small> : null}</td>
        <td>{mciKindLabel(row.kind)}</td>
        <td>{formatBangkokDateTime(row.occurredAt)}</td>
        <td>{row.closedAt ? formatBangkokDateTime(row.closedAt) : <span className="status status-pending">เปิดอยู่</span>}</td>
        <td>{row.patients}</td>
        <td>{row.responders}</td>
        <td><Link href={`/mci/incidents/${encodeURIComponent(row.id)}`}>สรุป</Link></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
