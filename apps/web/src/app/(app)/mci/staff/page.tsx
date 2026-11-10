import { mciCan } from '@backoffice/core';
import { formatBangkokTime } from '../../../../lib/bangkok-time';
import { mciRoleLabel, mciText } from '../../../../lib/mci-labels';
import { CheckOutButton } from '../ops/check-in-card';
import { IncidentBanner, mciContext, MciPageMessage } from '../mci-page';
import { ResponderEditForm } from './responder-actions';

export const dynamic = 'force-dynamic';
const TITLE = 'กำลังคนในเหตุ';

/** กำลังคน: who reported in, grouped by จุด (รอจัดจุด first), with ย้ายจุด, บทบาท and ออกจากเวร by role (checked again on the server). */
export default async function MciStaffPage() {
  const context = await mciContext();
  if (!context.ok) return <MciPageMessage title={TITLE} reason={context.reason} />;
  const { incident, settings, queries, actor, commands } = context;
  if (!incident) return <section><h2>{TITLE}</h2><IncidentBanner incident={null} /></section>;
  if (!commands && actor?.commandRole !== 'COMMANDER' && actor?.commandRole !== 'ZONE_LEAD') return <MciPageMessage title={TITLE} reason="forbidden" />;
  const responders = await queries.responders(incident.id);
  const zones = settings.zones.filter((zone) => zone.isActive).map(({ id, name }) => ({ id, name }));
  const canAssignRole = mciCan(actor, commands, 'assignRole');
  const groups = [{ id: null as string | null, name: mciText.waitingZone }, ...settings.zones.filter((zone) => zone.isActive || responders.some((responder) => responder.zoneId === zone.id))]
    .map((zone) => ({ ...zone, people: responders.filter((responder) => (responder.zoneId ?? null) === zone.id) }))
    .filter((group) => group.id !== null || group.people.length > 0);
  const professionCounts = settings.professions.map((profession) => ({ name: profession.name, count: responders.filter((responder) => responder.professionId === profession.id).length })).filter((entry) => entry.count > 0);
  return <section className="mci-staff">
    <h2>{TITLE}</h2>
    <IncidentBanner incident={incident} />
    <p>รายงานตัวอยู่ {responders.length} คน{professionCounts.length > 0 ? `: ${professionCounts.map((entry) => `${entry.name} ${entry.count}`).join(' · ')}` : ''}</p>
    <div className="mci-staff-grid">
      {groups.map((group) => <section key={group.id ?? 'waiting'} className={`mci-staff-zone${group.id === null ? ' mci-staff-waiting' : ''}`} aria-label={group.name}>
        <h3>{group.name} <small className="muted">({group.people.length})</small></h3>
        {group.people.length === 0 ? <p className="muted">ยังไม่มีคน</p> : <ul>
          {group.people.map((responder) => {
            const name = responder.displayName ?? '—';
            const manage = mciCan(actor, commands, 'manageResponder', responder.zoneId);
            return <li key={responder.id}>
              <div><strong>{name}</strong> <span className="muted">{responder.professionName ?? '—'} · {mciRoleLabel(responder.commandRole)} · {formatBangkokTime(responder.checkedInAt)}</span></div>
              {manage && <div className="request-actions">
                <ResponderEditForm responder={{ id: responder.id, displayName: name, zoneId: responder.zoneId, commandRole: responder.commandRole }} zones={zones} canAssignRole={canAssignRole} />
                <CheckOutButton responderId={responder.id} label="ให้ออกจากเวร" />
              </div>}
            </li>;
          })}
        </ul>}
      </section>)}
    </div>
  </section>;
}
