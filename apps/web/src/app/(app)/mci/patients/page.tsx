import { formatTag, mciCan } from '@backoffice/core';
import { mciGenderLabel, mciText } from '../../../../lib/mci-labels';
import { IncidentBanner, mciContext, MciPageMessage, patientOptions } from '../mci-page';
import { PatientForm } from './patient-form';

export const dynamic = 'force-dynamic';
const TITLE = 'ผู้ป่วยในเหตุ';

/** ผู้ป่วย of the open เหตุ: every casualty with colour, zone and status; บันทึก and แก้ไข by role (checked again on the server). */
export default async function MciPatientsPage() {
  const context = await mciContext();
  if (!context.ok) return <MciPageMessage title={TITLE} reason={context.reason} />;
  const { incident, settings, queries, actor, commands } = context;
  if (!incident) return <section><h2>{TITLE}</h2><IncidentBanner incident={null} /></section>;
  if (!mciCan(actor, commands, 'viewPatients')) return <MciPageMessage title={TITLE} reason="forbidden" />;
  const patients = await queries.patients(incident.id);
  const options = patientOptions(settings);
  const byId = <T extends { id: string }>(rows: readonly T[], id: string) => rows.find((row) => row.id === id);
  const canHide = mciCan(actor, commands, 'assignRole');
  return <section className="mci-patients">
    <h2>{TITLE}</h2>
    <IncidentBanner incident={incident} />
    {mciCan(actor, commands, 'record') && <PatientForm options={options} defaultZoneId={actor?.zoneId ?? null} canHide={canHide} />}
    {patients.length === 0 ? <p>ยังไม่มีผู้ป่วยในเหตุนี้</p> : <div className="leave-table-scroll"><table className="mci-patient-table">
      <thead><tr><th>ป้าย</th><th>{mciText.triage}</th><th>{mciText.zone}</th><th>{mciText.status}</th><th>ชื่อ</th><th>เพศ / อายุ</th><th>{mciText.hn}</th><th></th></tr></thead>
      <tbody>{patients.map((patient) => {
        const level = byId(settings.triageLevels, patient.triageLevelId);
        const status = byId(settings.statuses, patient.statusId);
        const tag = formatTag(patient.tagNo);
        const name = `${patient.firstName} ${patient.lastName}`.trim();
        return <tr key={patient.id}>
          <td className="mci-tag">{tag}</td>
          <td><span className="mci-triage-pill" style={{ '--triage': level?.colorHex ?? '#9CA3AF' } as React.CSSProperties}>{level?.name ?? '—'}</span></td>
          <td>{byId(settings.zones, patient.zoneId)?.name ?? '—'}</td>
          <td>{status?.name ?? '—'}{patient.destinationHospital ? ` (${patient.destinationHospital})` : ''}{patient.publicHidden ? <small className="muted"> · ไม่เปิดเผย</small> : null}</td>
          <td>{name || <span className="muted">ยังไม่ทราบชื่อ</span>}</td>
          <td>{mciGenderLabel(patient.gender)}{patient.ageEstimate == null ? '' : ` / ${patient.ageEstimate}`}</td>
          <td>{patient.hn || '—'}</td>
          <td className="request-actions">{mciCan(actor, commands, 'editPatient', patient.zoneId) && <PatientForm options={options} canHide={canHide}
            patient={{ id: patient.id, tag, triageLevelId: patient.triageLevelId, statusId: patient.statusId, zoneId: patient.zoneId, destinationHospital: patient.destinationHospital,
              firstName: patient.firstName, lastName: patient.lastName, gender: patient.gender, ageEstimate: patient.ageEstimate, hn: patient.hn, publicHidden: patient.publicHidden }} />}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
