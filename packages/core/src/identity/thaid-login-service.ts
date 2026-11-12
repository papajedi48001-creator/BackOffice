import type { Database } from '@backoffice/db';
import type { NationalIdProtector } from '../crypto/national-id.ts';
import type { LoginAuditRecorder } from './auth-service.ts';

export type ThaidResolution = { kind: 'active'; personId: string } | { kind: 'inactive' } | { kind: 'not_found' };

const unknownTarget = '00000000-0000-0000-0000-000000000000';

/**
 * เข้าสู่ระบบด้วย ThaID: the HR national ID is the link, so no link table is needed. The บุคลากร is found by the national-ID lookup
 * HMAC already kept for everyone (person.national_id_lookup); the citizen ID itself is never queried, stored, logged or audited.
 */
export class ThaidLoginService {
  constructor(private readonly database: Database, private readonly protector: NationalIdProtector, private readonly audit: LoginAuditRecorder) {}

  private async person(citizenId: string): Promise<{ id: string; employmentStatus: string } | null> {
    const rows = await this.database.query<{ id: string; employmentStatus: string }>(
      'SELECT id, employment_status AS employmentStatus FROM person WHERE national_id_lookup = ? AND deleted_at IS NULL LIMIT 1', [this.protector.lookup(citizenId)]);
    return rows[0] ?? null;
  }

  /** The ACTIVE บุคลากร with this citizen ID, or null; nothing is audited. */
  async findActivePerson(citizenId: string): Promise<string | null> {
    const person = await this.person(citizenId);
    return person?.employmentStatus === 'ACTIVE' ? person.id : null;
  }

  async resolve(citizenId: string): Promise<ThaidResolution> {
    const person = await this.person(citizenId);
    if (!person) {
      await this.audit.recordAudit({ actorPersonId: null, action: 'identity.thaid_login', targetType: 'person', targetId: unknownTarget, result: 'FAILURE', metadata: { stage: 'not_found' } });
      return { kind: 'not_found' };
    }
    if (person.employmentStatus !== 'ACTIVE') {
      await this.audit.recordAudit({ actorPersonId: person.id, action: 'identity.thaid_login', targetType: 'person', targetId: person.id, result: 'FAILURE', metadata: { stage: 'inactive' } });
      return { kind: 'inactive' };
    }
    await this.audit.recordAudit({ actorPersonId: person.id, action: 'identity.thaid_login', targetType: 'person', targetId: person.id, result: 'SUCCESS', metadata: {} });
    return { kind: 'active', personId: person.id };
  }
}
