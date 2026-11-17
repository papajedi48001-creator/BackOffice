import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { csvOf } from '../mass-casualty/mci-export';
import type { DirectoryPerson } from './hr-directory';

const NOT_SET = 'ยังไม่ระบุ';
const header = ['รหัสบุคลากร', 'ชื่อ-นามสกุล', 'ตำแหน่งงาน', 'ประเภทการจ้าง', 'หน่วยงาน', 'เลขประจำตัวประชาชน', 'สถานะ'];

/** ทะเบียนบุคลากร as CSV for Excel, with the same columns as the page. Only the masked national ID ever leaves the system. */
export function peopleCsv(people: ReadonlyArray<DirectoryPerson>): string {
  return csvOf([header, ...people.map((person) => [
    person.employeeCode ?? NOT_SET, person.displayName ?? NOT_SET, person.positionTitle ?? NOT_SET, person.employmentTypeName ?? NOT_SET,
    person.organizationName ?? NOT_SET, person.nationalIdMasked ?? NOT_SET, person.employmentStatus === 'ACTIVE' ? 'คงอยู่' : 'ลาออก'
  ])]);
}

/** การส่งออกข้อมูล of the people the caller already limited to the actor's scope and filters; audits the row count only. Callers check `data.export`. */
export async function exportPeople(database: Pick<Database, 'transaction'>, actorPersonId: string, people: ReadonlyArray<DirectoryPerson>, createId: () => string = randomUUID): Promise<string> {
  await database.transaction((tx) => new AuditService(new DatabaseAuditRepository(tx), createId).recordAudit({ actorPersonId, action: 'hr.people.export', targetType: 'module', targetId: 'hr', result: 'SUCCESS', metadata: { exportKind: 'people', rows: people.length } }));
  return peopleCsv(people);
}
