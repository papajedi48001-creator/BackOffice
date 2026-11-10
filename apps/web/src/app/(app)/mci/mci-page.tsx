import type { Session } from '@backoffice/contracts';
import { canCommandMci, loadActor, MciQueries, MciSettingsQueries, type MciActor, type MciIncidentRow, type MciSettings } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { mciKindLabel, mciText } from '../../../lib/mci-labels';
import { leaveSession } from '../leave/leave-page';

type MciSession = Session & { personId: string };
export type MciContext = {
  ok: true; session: MciSession; database: Database; queries: MciQueries; settings: MciSettings;
  /** The open เหตุ, or null between เหตุ. */
  incident: MciIncidentRow | null;
  /** The person's บทบาทสั่งการ in the open เหตุ; null when they have not reported in. */
  actor: MciActor;
  /** Holds mci.command: ผู้บัญชาการเหตุ in every เหตุ, and ตั้งค่า. */
  commands: boolean;
} | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' };

/** The session, settings, open เหตุ and the person's role in it for an อุบัติเหตุหมู่ page. `commander` pages also need mci.command (checked here, on the server). */
export async function mciContext({ commander = false } = {}): Promise<MciContext> {
  const session = await leaveSession();
  if (!session) return { ok: false, reason: 'none' };
  const commands = canCommandMci(session);
  if (commander && !commands) return { ok: false, reason: 'forbidden' };
  const database = getSharedDatabase();
  if (!database) return { ok: false, reason: 'unavailable' };
  const queries = new MciQueries(database);
  const [settings, incident] = await Promise.all([new MciSettingsQueries(database).settings(), queries.openIncident()]);
  const actor = incident ? await loadActor(database, incident.id, session.personId) : null;
  return { ok: true, session, database, queries, settings, incident, actor, commands };
}

/** The page title and why it cannot show: nothing while a visitor is sent to sign in, otherwise a no-access or load-error notice. */
export function MciPageMessage({ title, reason }: { title: string; reason: 'none' | 'forbidden' | 'unavailable' }) {
  if (reason === 'none') return null;
  return <section><h2>{title}</h2><p role="alert">{reason === 'forbidden' ? mciText.noAccess : mciText.loadError}</p></section>;
}

/** The red (or, for ซ้อมแผน, striped) strip naming the open เหตุ at the top of every อุบัติเหตุหมู่ page. */
export function IncidentBanner({ incident }: { incident: MciIncidentRow | null }) {
  if (!incident) return <p className="mci-incident-banner mci-incident-none">{mciText.noIncident}</p>;
  return <div className={`mci-incident-banner${incident.kind === 'DRILL' ? ' mci-incident-drill' : ''}`} role="note">
    {incident.kind === 'DRILL' && <strong>{mciText.drillBanner}</strong>}
    <span>{mciKindLabel(incident.kind)}: {incident.title}{incident.location ? ` · ${incident.location}` : ''}</span>
  </div>;
}

/** Options for the patient form: the switched-on zones, colours and statuses in display order. */
export function patientOptions(settings: MciSettings) {
  return {
    zones: settings.zones.filter((zone) => zone.isActive).map(({ id, name }) => ({ id, name })),
    triageLevels: settings.triageLevels.filter((level) => level.isActive).map(({ id, name, colorHex }) => ({ id, name, colorHex })),
    statuses: settings.statuses.filter((status) => status.isActive).map(({ id, name, needsDestination }) => ({ id, name, needsDestination }))
  };
}
