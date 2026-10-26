import type { Database } from '@backoffice/db';
import type { TravelPerson } from './new/travel-form';

/** The signed-in person as the หัวหน้าคณะ row of the form: name and current unit only. */
export async function leaderOf(database: Pick<Database, 'query'>, personId: string): Promise<TravelPerson> {
  const [row] = await database.query<TravelPerson>('SELECT p.id AS personId, p.display_name AS displayName, (SELECT o.name FROM employment_assignment ea JOIN organization o ON o.id = ea.organization_id WHERE ea.person_id = p.id AND ea.effective_until IS NULL ORDER BY ea.effective_from DESC LIMIT 1) AS organizationName FROM person p WHERE p.id = ?', [personId]);
  return row ?? { personId, displayName: null, organizationName: null };
}
