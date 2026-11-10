import Link from 'next/link';
import { formatTag } from '@backoffice/core';
import { formatBangkokDateTime } from '../../../../../lib/bangkok-time';
import { mciGenderLabel, mciKindLabel, mciRoleLabel, mciText } from '../../../../../lib/mci-labels';
import { mciContext, MciPageMessage } from '../../mci-page';
import { PrintButton } from '../incident-actions';

export const dynamic = 'force-dynamic';
const TITLE = 'สรุปเหตุ';

/** สรุปเหตุ: counts by colour and status, the casualties and the staff; พิมพ์ and CSV (after ปิดเหตุ). ผู้บัญชาการเหตุ only. */
export default async function MciIncidentSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await mciContext({ commander: true });
  if (!context.ok) return <MciPageMessage title={TITLE} reason={context.reason} />;
  const { id } = await params;
  const { settings, queries } = context;
  const incident = await queries.incident(id);
  if (!incident) return <section><h2>{TITLE}</h2><p role="alert">ไม่พบเหตุนี้</p></section>;
  const [patients, responders] = await Promise.all([queries.patients(incident.id), queries.responders(incident.id, { activeOnly: false })]);
  const name = <T extends { id: string; name: string }>(rows: readonly T[], rowId: string | null) => rows.find((row) => row.id === rowId)?.name ?? '—';
  const count = (key: 'triageLevelId' | 'statusId', rowId: string) => patients.filter((patient) => patient[key] === rowId).length;
  const exportUrl = (kind: 'patients' | 'responders') => `/api/mci/incidents/${encodeURIComponent(incident.id)}/export?kind=${kind}`;
  return <section className="mci-summary">
    <h2>{TITLE}: {incident.title}</h2>
    {incident.kind === 'DRILL' && <p className="mci-incident-banner mci-incident-drill"><strong>{mciText.drillBanner}</strong></p>}
    <p>{mciKindLabel(incident.kind)}{incident.location ? ` · ${incident.location}` : ''} · {mciText.occurredAt} {formatBangkokDateTime(incident.occurredAt)}
      {' · '}{incident.closedAt ? `ปิดเหตุ ${formatBangkokDateTime(incident.closedAt)}` : 'ยังเปิดอยู่'}</p>
    <div className="request-actions mci-no-print">
      <PrintButton />
      {incident.closedAt ? <>
        <a className="button-secondary" href={exportUrl('patients')} download>ส่งออกรายชื่อผู้ป่วย (CSV)</a>
        <a className="button-secondary" href={exportUrl('responders')} download>ส่งออกรายชื่อเจ้าหน้าที่ (CSV)</a>
      </> : <span className="muted">ส่งออก CSV ได้หลังปิดเหตุ</span>}
      <Link href="/mci/incidents">กลับไปหน้าเหตุ</Link>
    </div>
    <h3>{mciText.boardByTriage} <small className="muted">(รวม {patients.length})</small></h3>
    <ul className="mci-triage-counts">
      {settings.triageLevels.map((level) => <li key={level.id} style={{ '--triage': level.colorHex } as React.CSSProperties}>
        <span className="mci-triage-swatch" aria-hidden="true" /><span className="mci-triage-name">{level.name}</span><strong className="mci-triage-count">{count('triageLevelId', level.id)}</strong>
      </li>)}
    </ul>
    <h3>{mciText.boardByStatus}</h3>
    <ul className="mci-status-counts">{settings.statuses.map((status) => <li key={status.id}><span>{status.name}</span> <strong>{count('statusId', status.id)}</strong></li>)}</ul>
    <h3>ผู้ป่วย</h3>
    {patients.length === 0 ? <p>ไม่มีผู้ป่วย</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>ป้าย</th><th>{mciText.triage}</th><th>{mciText.status}</th><th>{mciText.zone}</th><th>ชื่อ</th><th>เพศ / อายุ</th><th>{mciText.hn}</th></tr></thead>
      <tbody>{patients.map((patient) => <tr key={patient.id}>
        <td className="mci-tag">{formatTag(patient.tagNo)}</td><td>{name(settings.triageLevels, patient.triageLevelId)}</td>
        <td>{name(settings.statuses, patient.statusId)}{patient.destinationHospital ? ` (${patient.destinationHospital})` : ''}</td><td>{name(settings.zones, patient.zoneId)}</td>
        <td>{`${patient.firstName} ${patient.lastName}`.trim() || '—'}</td><td>{mciGenderLabel(patient.gender)}{patient.ageEstimate == null ? '' : ` / ${patient.ageEstimate}`}</td><td>{patient.hn || '—'}</td>
      </tr>)}</tbody>
    </table></div>}
    <h3>เจ้าหน้าที่ที่รายงานตัว ({responders.length})</h3>
    {responders.length === 0 ? <p>ไม่มีผู้รายงานตัว</p> : <div className="leave-table-scroll"><table>
      <thead><tr><th>ชื่อ</th><th>{mciText.profession}</th><th>{mciText.zone}</th><th>{mciText.role}</th><th>รายงานตัว</th><th>ออกจากเวร</th></tr></thead>
      <tbody>{responders.map((responder) => <tr key={responder.id}>
        <td>{responder.displayName ?? '—'}</td><td>{responder.professionName ?? '—'}</td><td>{responder.zoneName ?? mciText.waitingZone}</td><td>{mciRoleLabel(responder.commandRole)}</td>
        <td>{formatBangkokDateTime(responder.checkedInAt)}</td><td>{responder.checkedOutAt ? formatBangkokDateTime(responder.checkedOutAt) : '—'}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
