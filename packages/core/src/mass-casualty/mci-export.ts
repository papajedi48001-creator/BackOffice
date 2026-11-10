import { randomUUID } from 'node:crypto';
import type { MciCommandRole } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { mciAudit } from './mci-db';
import { MciQueries } from './mci-queries';
import { formatTag } from './mci-rules';
import { MciSettingsQueries } from './mci-settings-queries';

export type MciExportKind = 'patients' | 'responders';

const commandRoleNames: Record<MciCommandRole, string> = { COMMANDER: 'ผู้บัญชาการเหตุ', ZONE_LEAD: 'หัวหน้าจุด', RECORDER: 'ผู้บันทึก', STAFF: 'เจ้าหน้าที่' };
const genderNames: Record<string, string> = { MALE: 'ชาย', FEMALE: 'หญิง', UNKNOWN: 'ไม่ทราบ' };
const bangkok = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const when = (iso: string | null) => (iso ? bangkok.format(new Date(iso)) : '');

/** CSV for Excel: a BOM, every cell quoted, and a leading = + - @ neutralised so a name can never run as a formula. */
export function csvOf(rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** ส่งออกสรุปเหตุที่ปิดแล้ว (ผู้ป่วย or เจ้าหน้าที่) with an audit row. Callers check `canCommandMci`. */
export async function exportIncident(database: Database, actorPersonId: string, incidentId: string, kind: MciExportKind): Promise<{ ok: true; csv: string; title: string } | { ok: false; code: 'NOT_FOUND' | 'INCIDENT_OPEN' }> {
  const queries = new MciQueries(database);
  const incident = await queries.incident(incidentId);
  if (!incident) return { ok: false, code: 'NOT_FOUND' };
  if (incident.status === 'OPEN') return { ok: false, code: 'INCIDENT_OPEN' };
  let rows: Array<Array<string | number | null>>;
  if (kind === 'patients') {
    const settings = await new MciSettingsQueries(database).settings();
    const name = (list: ReadonlyArray<{ id: string; name: string }>, id: string) => list.find((row) => row.id === id)?.name ?? '';
    rows = [['เลขป้าย', 'สี', 'สถานะ', 'จุด', 'รพ.ปลายทาง', 'ชื่อ', 'นามสกุล', 'เพศ', 'อายุ (ประมาณ)', 'HN', 'ไม่เปิดเผยบนกระดาน', 'แก้ไขล่าสุด'],
      ...(await queries.patients(incidentId)).map((patient) => [formatTag(patient.tagNo), name(settings.triageLevels, patient.triageLevelId), name(settings.statuses, patient.statusId), name(settings.zones, patient.zoneId), patient.destinationHospital, patient.firstName, patient.lastName, genderNames[patient.gender] ?? '', patient.ageEstimate, patient.hn, patient.publicHidden ? 'ใช่' : '', when(patient.updatedAt)])];
  } else {
    const hours = (from: string, to: string | null) => (to ? Math.round((Date.parse(to) - Date.parse(from)) / 360000) / 10 : null);
    rows = [['ชื่อ', 'สายวิชาชีพ', 'จุด', 'บทบาทสั่งการ', 'เวลาเข้า', 'เวลาออก', 'ชั่วโมง'],
      ...(await queries.responders(incidentId, { activeOnly: false })).map((responder) => [responder.displayName ?? '', responder.professionName ?? '', responder.zoneName ?? 'รอจัดจุด', commandRoleNames[responder.commandRole], when(responder.checkedInAt), when(responder.checkedOutAt), hours(responder.checkedInAt, responder.checkedOutAt)])];
  }
  await database.transaction((tx) => mciAudit(tx, randomUUID, actorPersonId, 'mci.incident.export', 'mci_incident', incidentId, { exportKind: kind, rows: rows.length - 1 }));
  return { ok: true, csv: csvOf(rows), title: incident.title };
}
