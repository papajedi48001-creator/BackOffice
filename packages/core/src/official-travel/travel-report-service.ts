import { randomUUID } from 'node:crypto';
import { travelReportInputSchema, type RequestStatus, type TravelReportInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { bangkokToday } from './travel-store';
import { tripStatus } from './travel-status';

/** รายงานการไปราชการ: the หัวหน้าคณะ files it once an approved trip has ended, and may edit it later. */
export class TravelReportService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async save(personId: string, travelId: string, input: TravelReportInput, today: string = bangkokToday()): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'REPORT_NOT_DUE' }> {
    const { summary, application } = travelReportInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const [trip] = await database.query<{ leaderPersonId: string; endDate: string }>("SELECT leader_person_id AS leaderPersonId, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate FROM official_travel WHERE id = ? FOR UPDATE", [travelId]);
      if (!trip || trip.leaderPersonId !== personId) return { ok: false as const, code: 'NOT_FOUND' as const };
      const statuses = await database.query<{ status: RequestStatus }>('SELECT r.status FROM official_travel_member m JOIN request r ON r.id = m.request_id WHERE m.travel_id = ?', [travelId]);
      if (tripStatus(statuses.map((row) => row.status)) !== 'APPROVED' || trip.endDate >= today) return { ok: false as const, code: 'REPORT_NOT_DUE' as const };
      const firstSave = (await database.query('SELECT travel_id FROM official_travel_report WHERE travel_id = ?', [travelId])).length === 0;
      await database.execute('INSERT INTO official_travel_report (travel_id, summary, application, submitted_by_person_id, submitted_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE summary = VALUES(summary), application = VALUES(application), updated_at = UTC_TIMESTAMP()', [travelId, summary, application, personId]);
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId: personId, action: 'official_travel.report.saved', targetType: 'official_travel', targetId: travelId, result: 'SUCCESS', metadata: { travelId, firstSave } });
      return { ok: true as const };
    });
  }
}
