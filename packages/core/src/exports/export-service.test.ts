import { describe, expect, it } from 'vitest';
import { ExportService } from './export-service';

describe('ExportService', () => {
  it('requires export permission even when the actor can view the data', async () => {
    const service = new ExportService({ canExport: async () => false }, { recordAudit: async () => undefined }, { enqueue: async () => undefined }, () => 'export-1');

    await expect(service.requestExport({ actorPersonId: 'person-a', reason: 'ตรวจสอบข้อมูล', moduleCode: 'hr', scope: { organizationId: 'unit-a' } })).rejects.toThrow('FORBIDDEN');
  });
});
