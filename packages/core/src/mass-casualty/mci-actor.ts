import type { MciCommandRole } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { MciActor } from './mci-access';

/** The person's check-in in a เหตุ that is still in effect (not checked out); `null` otherwise. */
export async function loadActor(database: Pick<Database, 'query'>, incidentId: string, personId: string): Promise<MciActor> {
  const [row] = await database.query<{ commandRole: MciCommandRole; zoneId: string | null }>('SELECT command_role AS commandRole, zone_id AS zoneId FROM mci_responder WHERE incident_id = ? AND person_id = ? AND checked_out_at IS NULL LIMIT 1', [incidentId, personId]);
  return row ? { personId, commandRole: row.commandRole, zoneId: row.zoneId ?? null } : null;
}
