import { randomUUID } from 'node:crypto';
import { travelTypeSettingInputSchema, type TravelTypeSettingInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

/** HR's travel settings: the final approval level of each ประเภทการเดินทาง. The route checks `travel.manage`. */
export class TravelSettingsService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async setApprovalTarget(actorPersonId: string, code: string, input: TravelTypeSettingInput): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' }> {
    const { approvalTarget } = travelTypeSettingInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const [type] = await database.query<{ code: string }>('SELECT code FROM official_travel_type WHERE code = ? FOR UPDATE', [code]);
      if (!type) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('UPDATE official_travel_type SET approval_target = ?, updated_at = UTC_TIMESTAMP() WHERE code = ?', [approvalTarget, code]);
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'official_travel.type.update', targetType: 'official_travel_type', targetId: code, result: 'SUCCESS', metadata: { travelType: code, changedFields: ['approvalTarget'] } });
      return { ok: true as const };
    });
  }
}
