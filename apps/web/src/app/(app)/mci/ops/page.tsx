import Link from 'next/link';
import { mciCan, MciResponderService } from '@backoffice/core';
import { formatBangkokDateTime } from '../../../../lib/bangkok-time';
import { mciRoleLabel, mciText } from '../../../../lib/mci-labels';
import { IncidentBanner, mciContext, MciPageMessage } from '../mci-page';
import { CheckInButton, CheckOutButton } from './check-in-card';

export const dynamic = 'force-dynamic';

/** ภาพรวม: the open เหตุ, my รายงานตัว (or the button to do it), and the counts by colour and status. */
export default async function MciOpsPage() {
  const context = await mciContext();
  if (!context.ok) return <MciPageMessage title={mciText.module} reason={context.reason} />;
  const { incident, settings, queries, session, actor, commands } = context;
  const professions = settings.professions.filter((profession) => profession.isActive).map(({ id, name }) => ({ id, name }));
  if (!incident) {
    return <section className="mci-ops">
      <h2>{mciText.module}</h2>
      <IncidentBanner incident={null} />
      <CheckInButton professions={professions} defaultProfessionId={null} disabled />
      {commands && <p><Link href="/mci/incidents">เปิดเหตุใหม่ที่หน้า เหตุ</Link></p>}
      <p><Link href="/mci/board">{mciText.boardLink}</Link></p>
    </section>;
  }
  const [me, patients] = await Promise.all([queries.myResponder(incident.id, session.personId), queries.patients(incident.id)]);
  const defaultProfessionId = me ? null : await new MciResponderService(context.database).defaultProfession(session.personId);
  const count = (key: 'triageLevelId' | 'statusId', id: string) => patients.filter((patient) => patient[key] === id).length;
  const canRecord = mciCan(actor, commands, 'record');
  return <section className="mci-ops">
    <h2>{mciText.module}</h2>
    <IncidentBanner incident={incident} />
    <div className="mci-duty-card">
      {me ? <>
        <p className="mci-duty-title">{mciText.checkedInAs}</p>
        <dl className="mci-duty">
          <div><dt>{mciText.zone}</dt><dd className="mci-duty-zone">{me.zoneName ?? mciText.waitingZone}</dd></div>
          <div><dt>{mciText.role}</dt><dd>{mciRoleLabel(me.commandRole)}</dd></div>
          <div><dt>{mciText.profession}</dt><dd>{me.professionName ?? '—'}</dd></div>
          <div><dt>เวลารายงานตัว</dt><dd>{formatBangkokDateTime(me.checkedInAt)}</dd></div>
        </dl>
        <div className="request-actions">
          {canRecord && <Link className="button-link" href="/mci/patients">บันทึกผู้ป่วย</Link>}
          <CheckOutButton responderId={me.id} />
        </div>
      </> : <>
        <p className="mci-duty-title">{mciText.notCheckedIn}</p>
        <CheckInButton professions={professions} defaultProfessionId={defaultProfessionId} />
      </>}
    </div>
    <h3>{mciText.boardByTriage} <small className="muted">(รวม {patients.length})</small></h3>
    <ul className="mci-triage-counts">
      {settings.triageLevels.filter((level) => level.isActive || count('triageLevelId', level.id) > 0).map((level) => <li key={level.id} style={{ '--triage': level.colorHex } as React.CSSProperties}>
        <span className="mci-triage-swatch" aria-hidden="true" /><span className="mci-triage-name">{level.name}</span><strong className="mci-triage-count">{count('triageLevelId', level.id)}</strong>
      </li>)}
    </ul>
    <h3>{mciText.boardByStatus}</h3>
    <ul className="mci-status-counts">
      {settings.statuses.filter((status) => status.isActive || count('statusId', status.id) > 0).map((status) => <li key={status.id}><span>{status.name}</span> <strong>{count('statusId', status.id)}</strong></li>)}
    </ul>
    <p><Link href="/mci/board">{mciText.boardLink}</Link></p>
  </section>;
}
